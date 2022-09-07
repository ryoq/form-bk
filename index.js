const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const multer = require("multer");
const request = require("request");
const fs = require("fs");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 4050;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static("."));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

const upload = multer({ dest: "/tmp/" });

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
  const SlackBotToken = `${process.env.SlackBotToken}`;
  const SlackApiUrl = "https://slack.com/api/";
  const SlackChannel = `${process.env.SlackChannel}`;
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

app.use(function (res) {
  res.status(404);
  res.json({ message: "not ok" });
});