const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const https = require('https');
const app = express();
const dotenv = require('dotenv');
dotenv.config();

const cookieParser = require('cookie-parser');

const nodemailer = require('nodemailer');
const crypto = require('crypto');

const bcrypt = require('bcrypt');
const saltRounds = 10;

const { sequelize, User } = require('./models');
const { Op } = require('sequelize');

// const jwt = require('jsonwebtoken');
const { generateToken, verifyToken } = require('./controllers/tokenFunctions');

// ? mkcert 에서 발급한 인증서를 사용하기 위한 코드입니다. 삭제하지 마세요!
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));

  const helmet = require('helmet');
  app.use(
    helmet.hsts({
      maxAge: 60 * 60 * 24 * 365, // 1 year
      includeSubDomains: true,
      preload: true,
    }),
  );
} else {
  app.use(morgan('dev'));

  app.use(
    cors({
      origin: 'http://localhost:3000',
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
    }),
  );
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// ! 로그인 후, 뒤로가기 버튼 방지 코드
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// ? React 배포 부분.
app.use('/', express.static(`${__dirname}/build`));
app.get('/', (req, res) => {
  if (`${__dirname}/index.html`) {
    res.sendFile(`${__dirname}/index.html`);
  }
  res.send('No index.html exists!');
});

// ? 라우터 부분 시작.
app.post('/email', async (req, res) => {
  try {
    // ? Google, Kakao, Email 계정으로 가입된 이메일이 있는지 확인.
    const existingUser = await User.findOne({
      where: {
        // 클라이언트에서 보내온 이메일 값을 가지면서, provider 칼럼의 값이 null 이 아닌 경우: 여기에서는 provider 의 값이 Google, Kakao, Email 등인 경우.
        email: req.body.email,
        provider: {
          [Op.ne]: null,
        },
      },
    });
    // Google, Kakao, Email 계정(provider) 등으로 가입된 이메일이 존재하면 provider 의 값을 응답으로 보내고 종료.
    if (existingUser) {
      return res.json({ provider: `${existingUser.provider}` });
    }

    // ? 클라이언트에서 보내온 이메일 값이 아예 없거나, provider 값이 null 인 경우 다음 과정을 계속 진행.
    // token 발행: 6자리 난수 생성
    const token = crypto.randomBytes(3).toString('hex');

    // 현재 시각 저장
    // const now = new Date();

    // 메일 발송 설정
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.TOKEN_EMAIL,
        pass: process.env.APP_SECRET,
      },
    });

    // 메일 발송 옵션 설정
    const mailOptions = {
      from: process.env.TOKEN_EMAIL,
      to: req.body.email,
      subject: '회원가입 인증코드 메일입니다.',
      text: `인증 코드는 ${token} 입니다.`,
    };

    // 메일 발송
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.log(error);
      }
      console.log('Email sent: ' + info.response);
    });

    // ? 가입된 이메일 계정이 없으면 새로운 사용자 생성
    const [user, created] = await User.findOrCreate({
      where: {
        email: req.body.email,
        provider: null,
      },
      defaults: {
        // ? findOrCreate 메소드가 사용자를 생성할 때 사용됩니다.
        token: token,

        // 테이블을 생성할 때 timestamps 옵션을 기본 값(true)을 사용하기 때문에 생성 시간을 저장하는 별도의 과정은 생략함.
        // createdAt: now,
      },
    });

    // ? 만약 사용자가 이미 존재한다면, 해당 사용자를 업데이트합니다.
    if (!created) {
      await user.update({
        token: token,

        // 테이블을 생성할 때 timestamps 옵션을 기본 값(true)을 사용하기 때문에 생성 시간을 저장하는 별도의 과정은 생략함.
        // updatedAt: now,
      });
    }

    res.json({ result: 'Check your email for verification code' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 에러' });
  }
});

app.post('/verify', async (req, res) => {
  try {
    // 이메일과 토큰으로 사용자 찾기
    const user = await User.findOne({
      where: {
        email: req.body.email,
        token: req.body.token,
        provider: null,
      },
    });

    if (!user) {
      return res.json({ result: 'Invalid email or token' });
    }

    // 토큰 생성 시간 확인
    const now = new Date();
    const diff = Math.abs(now - user.updatedAt) / 1000; // 초 단위로 변환

    if (diff > 180) {
      // 3분 = 180초
      return res.json({ result: 'Token expired' });
    }

    res.json({ result: 'User verified' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 에러' });
  }
});

app.post('/signup', async (req, res) => {
  try {
    // 비밀번호를 암호화
    const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);

    // 가입된 이메일 계정이 없으면 새로운 사용자로 업데이트(provider: 'Email').
    await User.update(
      {
        password: hashedPassword,
        provider: 'Email',
        token: null,
      },
      {
        where: {
          email: req.body.email,
          provider: null,
        },
      },
    );
    res.json({ result: 'Signup success' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 에러' });
  }
});

app.post('/login', async (req, res) => {
  try {
    // 먼저 가입된 이메일 계정이 존재하는지 확인
    const user = await User.findOne({
      where: {
        email: req.body.email,
        provider: 'Email',
      },
    });

    // 가입된 이메일이 존재하지 않으면 메시지 보내고 종료.
    if (!user) {
      return res.json({ result: '존재하지 않는 이메일입니다.' });
    }

    // 조건을 만족하는 이메일 계정이 존재하면 비밀번호 확인
    // 요청된 비밀번호와 암호화되어 저장되어 있는 비밀 번호를 비교
    const match = await bcrypt.compare(req.body.password, user.password);

    if (!match) {
      return res.json({ result: '비밀번호가 일치하지 않습니다.' });
    }
    // ? 이메일과 비번이 일치하는 user 가 있으면 다음 단계로 넘어감.

    const { accessToken, refreshToken } = await generateToken(user, req.body.checkedKeepLogin);

    if (refreshToken) {
      // ? Expires 옵션이 있는 Persistent(영속성) Cookie
      res.cookie('refresh_jwt', refreshToken, {
        domain: process.env.NODE_ENV === 'production' ? 'infothings.net' : 'localhost',
        path: '/',
        sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'none',
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'production',
        expires: new Date(Date.now() + 24 * 3600 * 1000 * 7), // 7일 후 소멸되는 Persistent Cookie
      });
    }

    // ? Expires 옵션이 없는 Session Cookie
    res.cookie('access_jwt', accessToken, {
      domain: process.env.NODE_ENV === 'production' ? 'infothings.net' : 'localhost',
      path: '/',
      sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'none',
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'production',
    });
    return res.redirect('/userInfo');
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 에러' });
  }
});

app.get('/userInfo', async (req, res) => {
  try {
    const accessToken = req.cookies['access_jwt'];
    const refreshToken = req.cookies['refresh_jwt'];
    const accessPayload = await verifyToken('access', accessToken);

    //  ! 이 부분의 코드가 없었을 때에는 로그인 시에 간헐적으로 지연 현상이 있었으나, 아래 코드를 적용한 이후에는 그런 현상이 사라졌음.
    // 이 부분은 session 으로 로그인 할 때에도 마찬가지였음.
    // 아마 DB 조회 과정에 어떤 영향을 끼치는 것 같음.
    if (!accessToken && !refreshToken) {
      return res.json({ result: 'Not Login Info' });
    }

    // accessToken 부터 먼저 검증.
    if (accessPayload) {
      const user = await User.findOne({
        where: {
          id: accessPayload.id,
          email: accessPayload.email,
        },
      });
      if (!user) {
        return res.status(401).send('Not Authorized');
      }
      return res.json({ result: 'Login success', email: user.email, provider: user.provider });
    } else if (refreshToken) {
      const refreshPayload = await verifyToken('refresh', refreshToken);

      if (!refreshPayload) {
        return res.status(401).send('Not Authorized');
      }

      const user = await User.findOne({
        where: {
          id: refreshPayload.id,
          email: refreshPayload.email,
        },
      });

      const { accessToken } = await generateToken(user);

      res.cookie('access_jwt', accessToken, {
        // ? Expires 옵션이 없는 Session Cookie
        domain: process.env.NODE_ENV === 'production' ? 'infothings.net' : 'localhost',
        path: '/',
        sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'none',
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'production',
      });

      return res.json({ result: 'Login success', email: user.email, provider: user.provider });
    }
  } catch (e) {
    console.error(e);
  }
});

app.post('/logout', (req, res) => {
  const refreshToken = req.cookies['refresh_jwt'];

  if (refreshToken) {
    res.clearCookie('refresh_jwt', {
      domain: process.env.NODE_ENV === 'production' ? 'infothings.net' : 'localhost',
      path: '/',
      sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'none',
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'production',
    });
  }

  res.clearCookie('access_jwt', {
    domain: process.env.NODE_ENV === 'production' ? 'infothings.net' : 'localhost',
    path: '/',
    sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'none',
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'production',
  });

  return res.json({ result: 'Logged Out Successfully' });
});

// 연결 객체를 이용해 DB 와 연결한다. sync 옵션은 원노트를 참조한다.
sequelize
  .sync({ force: false })
  .then(() => console.log('DB is ready'))
  .catch((e) => console.log(e));

const port = process.env.PORT || 4000;

if (process.env.NODE_ENV === 'production') {
  app.listen(port, () => console.log(`Server is running on port ${port}`));
} else {
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
}
