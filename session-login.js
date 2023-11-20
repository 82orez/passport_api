const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const session = require('express-session');
const fs = require('fs');
const https = require('https');
const app = express();
const dotenv = require('dotenv');
dotenv.config();

const bcrypt = require('bcrypt');
const saltRounds = 10;

const { sequelize, User } = require('./models');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const sessionStore = new SequelizeStore({
  db: sequelize,
});

//mkcert 에서 발급한 인증서를 사용하기 위한 코드입니다. 삭제하지 마세요!
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// express-session 라이브러리를 이용해 쿠키 설정을 해줄 수 있습니다.
app.use(
  session({
    secret: '@codestates',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      domain: 'localhost',
      path: '/',
      sameSite: 'none',
      httpOnly: true,
      secure: true,
    },
  }),
);

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS 설정이 필요합니다. 클라이언트가 어떤 origin 인지에 따라 달리 설정할 수 있습니다.
// 메서드는 GET, POST, OPTIONS 를 허용합니다.
app.use(
  cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  }),
);

// ! React 배포 부분.
app.use('/', express.static(`${__dirname}/build`));
app.get('/', (req, res) => {
  if (`${__dirname}/index.html`) {
    res.sendFile(`${__dirname}/index.html`);
  }
  res.send('No index.html exists!');
});

// 라우터 부분 시작.
app.post('/signup', async (req, res) => {
  try {
    // 이메일이 이미 존재하는지 확인.
    const existingUser = await User.findOne({
      where: {
        email: req.body.email,
      },
    });

    // 이메일이 이미 존재하면 메시지를 보내고 종료.
    if (existingUser) {
      return res.json({ result: 'Existing Email' });
    }

    // 비밀번호를 암호화
    const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);

    // 가입된 이메일이 없으면 새로운 사용자 생성
    await User.create({
      email: req.body.email,
      password: hashedPassword,
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
      const user = await User.findOne({
      where: {
        email: req.body.email,
      },
    });

    // 이메일이 존재하지 않으면 메시지 보내고 종료.
    if (!user) {
      return res.json({ result: '존재하지 않는 이메일입니다.' });
    }
    // 이메일이 존재하면 비밀번호 확인

    // 요청된 비밀번호와 암호화되어 저장되어 있는 비밀 번호를 비교
    const match = await bcrypt.compare(req.body.password, user.password);

    if (!match) {
      return res.json({ result: '비밀번호가 일치하지 않습니다.' });
    }
    // ? 이메일과 비번이 일치하는 user 가 있으면 다음 단계로 넘어감.

    // ! session 을 이용해서 쿠키를 발행하는 부분을 변경함.
    if (!user.id) {
      res.status(401).send('Not Authorized');
    } else if (req.body.checkedKeepLogin) {
      // * Session Id 생성.
      // * req.session + .변수명(userId) 를 사용해 세션 객체에 user.id를 저장
      req.session.userId = user.id;
      // '로그인 상태 유지'에 체크가 되어 있으면 7일짜리 영속성 쿠키 발생.
      req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000;
      res.redirect('/userinfo');
    } else {
      req.session.userId = user.id;
      res.redirect('/userinfo');
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 에러' });
  }
});

app.get('/userInfo', async (req, res) => {
  try {
    const userId = req.session.userId;

    // 세션 정보에 userId 값이 정의되어 있는지 확인
    // userId 값이 undefined 인 경우, 즉 로그인 상태 유지 정보가 없는 경우에는 { result: 'Not Login Info' }으로 응답하고 함수를 종료시키도록 했습니다. 이렇게 하면 User.findOne() 메소드를 호출할 때 id 의 값이 undefined 인 것을 방지할 수 있습니다.
    // 그리고 이 응답을 클라이언트에서 조건문으로 분기하여 처리하게 함.
    if (!userId) {
      return res.json({ result: 'Not Login Info' });
    }

    const user = await User.findOne({
      where: {
        id: userId,
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
  if (!req.session.userId) {
    res.status(400).send('Not Authorized');
  } else {
    req.session.destroy((err) => {
      if (err) {
        console.log(err);
      }
      res.status(205).send('Logged Out Successfully');
    });
  }
});

// 연결 객체를 이용해 DB 와 연결한다. sync 옵션은 원노트를 참조한다.
sequelize
  .sync({ force: false })
  .then(() => console.log('DB is ready'))
  .catch((e) => console.log(e));

// 세션 스토어를 DB 와 동기화.
sessionStore.sync();

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
  server.listen(port, () => console.log(`HTTPS Server is starting on ${port}`));
} else {
  server = app.listen(port, () => console.log(`HTTP Server is starting on ${port}`));
}
module.exports = server;

// ! 쿠키 적용을 위해 일단 주석 처리
// app.listen(port, () => console.log(`Server is running on port ${port}`));

// http://localhost:8081/
// https://localhost:8081/
// Sever 종료는 터미널에서 ctrl + C
