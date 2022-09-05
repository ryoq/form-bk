/*
■このファイルで使うモジュールのインポート
①：express
node.jsのフレームワーク。
javascriptをサーバーサイドで使えるようになる。
②：bodyParser
HTTP通信で送られた値を扱うために必要。
要説明
③：path
ファイル名からファイルだけでファイルのパスが通る。
④：multer
ファイルをアップロードする際に必要
⑤：request
HTTP通信が簡単になる
⑥：fs
ファイルを読み込むのに必要
⑦：cors
異なるオリジン間での通信を可能にする
*/
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const multer = require("multer");
const request = require("request");
const fs = require("fs");
const cors = require("cors");
const axios = require("axios");

//■Express の起動、サーバーの立ち上げ、使用する静的ファイルの場所の指定、JSONを使用するために登録、htmlのinputタグの値を受け取るための設定、異なるオリジン間でのHTTP通信を可能にする設定
const app = express();
const PORT = process.env.PORT || 4050;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static("."));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

//■POSTで受け取ったファイルの保存先の指定
const upload = multer({ dest: "/tmp/" });

//必要ないかも
const TestKey = `${process.env.TestKey}`;

/*
■バックエンドの方針
①inquireにpostが来た場合の処理
 １）名前やアドレス、ファイルによってバリデーションを行う
 →全ての項目で問題がない時はバリデーションを終わる(Slackへの送信へ移る)
 →ある項目でエラーが生じた場合は　responseのdataのmessageオプジェクトで{エラー項目：エラー内容}をレスポンスする。また、status400を返す。returnでプログラムを終える。
 ※fileのバリデーションでfiletypeとfilesizeはelseifではなくifの方が良いかも。同時に成り立つから。同時に2個エラー出した方が親切かもしれない。
 ２）SlackApiにPOSTする
 バリデーションを通っているため、SlackApiを使うのに必要な引数に使う値は揃っている。
 APIからはerrorとresponseを返されるから、それぞれの値について、正常な処理とエラーの処理を行う。
 ３）Inquireへpost以外のHTTPリクエストがあった場合は404を返す
*/
app.post("/inquire", upload.single("file"), (req, res) => {
  console.log("POST /inquire");
  let err = { message: {} };
  let ErrorOrNot = false;
  if (req.body.name.length === 0) {
    err["message"]["name"] = "入力されていません";
    ErrorOrNot = true;
  }

  if (req.body.address.length === 0) {
    err["message"]["address"] = "入力されていません";
    ErrorOrNot = true;
    //TLDを満たす正規表現。中身の理解はまだ出来ていない。
  } else if (
    !req.body.address.match(
      /^[a-zA-Z0-9_+-]+(\.[a-zA-Z0-9_+-]+)*@([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.)+[a-zA-Z]{2,}$/
    )
  ) {
    err["message"]["address"] = "メールアドレスの形式ではありません";
    ErrorOrNot = true;
  }

  if (req.file === undefined) {
    err["message"]["file"] = "選択されていません";
    ErrorOrNot = true;
  } else if (req.file.mimetype !== "application/pdf") {
    err["message"]["file"] = "PDFファイルではありません";
    ErrorOrNot = true;
    //１MB=1024*1024BだとMacの表示と計算合わない
    //pdfでなくかつ３Mb以上だと3Mbのエラー発生しない
  } else if (req.file.size > 3000000) {
    err["message"]["file"] = "3M以下のファイルではありません";
    ErrorOrNot = true;
  }

  if (ErrorOrNot) {
    res.status(400);
    res.json(err);
    return;
  }

  // ここからSlackへ転送する処理
  const SlackBotToken = "C0416LQGAH2";
  //`${process.env.SlackBotToken}`;
  const SlackApiUrl = "https://slack.com/api/";
  const SlackChannel = "xoxb-4031641060806-4038266418178-8lAZFyHvugYOt1vgtpQ9o9J0";
  //`${process.env.SlackChannel}`;
  const SlackFileName = req.file.originalname;
  const RawFileSize = req.file.size;
  const SlackFileSize = Math.round((RawFileSize / 1000000) * 10) / 10;
  const SlackAddress = req.body.address;
  const SlackName = req.body.name;
  const SlackFilesPath = req.file.path;
  const SlackDisplay = `
    ■ファイルが送信されました■
    =======
    お名前 : ${SlackName}
    メールアドレス : ${SlackAddress}
    ファイル : ${SlackFileName}
    ファイルサイズ : ${SlackFileSize}MB
    =======
  `;

  options = {
    token: SlackBotToken,
    channels: SlackChannel,
    filename: SlackFileName,
    file: fs.createReadStream(SlackFilesPath),
  };
  request.post(
    { url: SlackApiUrl + "files.upload", formData: options },
    function (error, response) {
      const ResponseBody = JSON.parse(response.body);
      if (!error && ResponseBody.ok === true) {
        res.status(200);
        res.json({ message: "ok" });
      } else {
        res.status(500);
        res.json({ message: "not ok" });
      }
    }
  );

  options = {
    token: SlackBotToken,
    channel: SlackChannel,
    text: SlackDisplay,
  };
  request.post(
    { url: SlackApiUrl + "chat.postMessage", formData: options },
    //もしかしたら第三引数にbody必要かもしれない。fileに関しても同様
    function (error, response) {
      const ResponseBody = JSON.parse(response.body);
      if (!error && ResponseBody.ok === true) {
        res.status(200);
        res.json({ message: "ok" });
      } else {
        res.status(500);
        res.json({ message: "not ok" });
      }
    }
  );
  return;
});
//引数のreq,next削除
app.use(function (res) {
  res.status(404);
  res.json({ message: "not ok" });
});

/*
変更前
axios
    .post(
      { url: SlackApiUrl + "files.upload", formData: options },  )
    .then(function(response){
      console.log(116)
      return(0)
    })

    .catch(function (error) {
      res.status(500);
      console.log(121)
      return(1);
    });
    const FileResult = axios.post()
    if(result === 1){
      res.status(500)
      return;
    }


async function chatpost() {
    const ChatResult = await axios
      .post({ url: SlackApiUrl + "chat.postMessage", formData: options })
      .then(function (response) {
        console.log(138);
        return 0;
      })
      .catch(function (error) {
        res.status(500);
        return 1;
      });
      return ChatResult
  }
  if (chatpost === 1) {
    res.status(500);
    return;
  }


console.log(175)
  //ここまでslack
  res.status(200);
  res.json({ message: "ok" });
*/
