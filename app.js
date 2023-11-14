const express = require('express');
const app = express();
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

// ! 개발 환경에서 https 를 사용하기 위한 작업 1
const fs = require('fs');
const https = require('https');
//? mkcert 에서 발급한 인증서를 사용하기 위한 코드입니다. 삭제하지 마세요!
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// DB 연결을 위해 models/index.js 파일에 있는 sequelize 연결 객체와 사용할 테이블(객체 모델)들을를 불러온다.
const { sequelize, User } = require('./models');
const cookieParser = require('cookie-parser');

// const { signup } = require('./controllers/user.controller');

app.use(morgan('dev'));

app.use(cookieParser());
app.use(
  cors({
    origin: 'http://localhost:3000', // 클라이언트의 주소를 입력하세요.
    methods: ['GET', 'POST'],
    credentials: true,
  }),
);

app.use(express.json({ strict: false }));
app.use(express.urlencoded({ extended: true }));

// ! React 배포 부분.
app.use('/', express.static(`${__dirname}/build`));
app.get('/', (req, res) => {
  if (`${__dirname}/index.html`) {
    res.sendFile(`${__dirname}/index.html`);
  }
  res.send('No index.html exists!');
});

app.post('/signup', async (req, res) => {
  try {
    // 이메일이 이미 존재하는지 확인
    const existingUser = await User.findOne({
      where: {
        email: req.body.email,
      },
    });

    // 이메일이 이미 존재하면 에러 메시지를 보냄
    if (existingUser) {
      return res.status(400).json({ error: '이미 가입된 이메일 주소입니다.' });
    }

    // 새로운 사용자 생성
    await User.create({
      email: req.body.email,
      password: req.body.password,
    });
    res.json({ result: 'Insert success' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 에러' });
  }
});

app.post('/login', async (req, res) => {
  try {
    // 먼저 이메일이 존재하는지 확인
    const emailExists = await User.findOne({
      where: {
        email: req.body.email,
      },
    });

    // 이메일이 존재하지 않으면 에러 메시지 보냄
    if (!emailExists) {
      return res.status(400).json({ error: '존재하지 않는 이메일입니다.' });
    }

    // 이메일이 존재하면 비밀번호 확인
    const user = await User.findOne({
      where: {
        email: req.body.email,
        password: req.body.password,
      },
    });

    // 비밀번호가 일치하지 않으면 에러 메시지 보냄
    if (!user) {
      return res.status(400).json({ error: '비밀번호가 일치하지 않습니다.' });
    }
    // ? 이메일과 비번이 일치하는 user 가 있으면 다음 단계로 넘어감.

    // ! user.id 를 이용해서 쿠키를 발행하는 부부을 변경함.
    const cookieOptions = {
      domain: 'localhost',
      path: '/',
      sameSite: 'none',
      secure: true,
      expires: new Date(Date.now() + 24 * 3600 * 1000 * 7), // 7일 후 소멸되는 Persistent Cookie
      httpOnly: true,
    };

    if (!user.id) {
      res.status(401).send('Not Authorized');
    } else if (req.body.checkedKeepLogin) {
      res.cookie('cookieId', user.id, cookieOptions);
      res.redirect('/userinfo');
    } else {
      delete cookieOptions.expires;
      res.cookie('cookieId', user.id, cookieOptions); // Expires 옵션이 없는 Session Cookie
      res.redirect('/userinfo');
    }

    // ? 쿠키 적용하기 전 코드이므로 주석 처리
    // 유저를 찾았다면 로그인 성공 메시지와 함께 user 의 이메일 정보도 전달
    // res.json({ result: 'Login success', email: user.email });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 에러' });
  }
});

// ! 쿠키 적용을 위해 새롭게 생성.
app.get('/userInfo', async (req, res) => {
  try {
    const cookieId = req.cookies.cookieId;

    // cookieId 값이 정의되어 있는지 확인
    // cookieId 값이 undefined 인 경우, 오류 메시지를 반환하고 함수를 종료시키도록 했습니다. 이렇게 하면 User.findOne() 메소드를 호출할 때 id 의 값이 undefined 인 것을 방지할 수 있습니다.
    if (!cookieId) {
      return res.status(400).json({ error: '쿠키 정보가 없습니다.' });
    }

    const user = await User.findOne({
      where: {
        id: cookieId,
      },
    });

    if (!user || !user.id) {
      res.status(401).send('Not Authorized');
    } else {
      res.json({ result: 'Login success', email: user.email });
    }
  } catch (e) {
    console.error(e);
  }
});

app.post('/logout', (req, res) => {
  res
    .status(205)
    .clearCookie('cookieId', {
      domain: 'localhost',
      path: '/',
      sameSite: 'none',
      secure: true,
    })
    .send('Logged Out Successfully');
});

// 연결 객체를 이용해 DB 와 연결한다. sync 옵션은 원노트를 참조한다.
sequelize
  .sync({ force: false })
  .then(() => console.log('DB is ready'))
  .catch((e) => console.log(e));

const port = process.env.PORT || 8081;

// ? 인증서 파일들이 존재하는 경우에만 https 프로토콜을 사용하는 서버를 실행합니다.
// ? 만약 인증서 파일이 존재하지 않는경우, http 프로토콜을 사용하는 서버를 실행합니다.
// * 파일 존재여부를 확인하는 폴더는 인증서가 저장되어 있는 /Users/tglee/developer/ssl 폴더입니다.
let server;
if (fs.existsSync('/Users/tglee/developer/ssl/key.pem') && fs.existsSync('/Users/tglee/developer/ssl/cert.pem')) {
  const privateKey = fs.readFileSync('/Users/tglee/developer/ssl/key.pem', 'utf8');
  const certificate = fs.readFileSync('/Users/tglee/developer/ssl/cert.pem', 'utf8');
  const credentials = {
    key: privateKey,
    cert: certificate,
  };

  server = https.createServer(credentials, app);
  server.listen(port, () => console.log(`🚀 HTTPS Server is starting on ${port}`));
} else {
  server = app.listen(port, () => console.log(`🚀 HTTP Server is starting on ${port}`));
}
module.exports = server;

// ! 쿠키 적용을 위해 일단 주석 처리
// app.listen(port, () => console.log(`Server is running on port ${port}`));

// http://localhost:8081/
// https://localhost:8081/
// Sever 종료는 터미널에서 ctrl + C
