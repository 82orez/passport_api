const express = require('express');
const app = express();
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('./passport');

// DB 연결을 위해 models/index.js 파일에 있는 sequelize 연결 객체와 사용할 테이블(객체 모델)들을를 불러온다.
const { sequelize, User } = require('./models');
const SequelizeStore = require('connect-session-sequelize')(session.Store);


// const { signup } = require('./controllers/user.controller');

// ! 미들웨어 순서에 주의해야 함.
app.use(morgan('dev'));

app.use(cookieParser());
app.use(cors({
  origin: 'http://localhost:3000', // 클라이언트의 주소를 입력하세요.
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json({ strict: false }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'secret code',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    // maxAge: 10 * 1000,
  },
  store: new SequelizeStore({
    db: sequelize
  })
}));

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


app.use(passport.initialize());
app.use(passport.session());

app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      console.error(err);
      return next(err);
    }
    if (!user) {
      return res.status(401).json(info);
    }
    req.logIn(user, function (err) {
      if (err) {
        console.error(err);
        return next(err);
      }
      return res.json({ result: 'Login success', email: req.user.email });
    });
  })(req, res, next);
});

app.get('/logout', (req, res) => {
  // req.logout();
  req.session.destroy();
  res.json({ result: 'Logout success' });
});

app.get('/check-login', (req, res) => {
  console.log(req.session)
  if (req.session) {
    res.json({ loggedIn: true });
  } else {
    res.json({ loggedIn: false });
  }
});



// 연결 객체를 이용해 DB 와 연결한다. sync 옵션은 원노트를 참조한다.
sequelize
  .sync({ force: true })
  .then(() => console.log('DB is ready'))
  .catch((e) => console.log(e));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server is running on port ${port}`));

// http://localhost:8080/
// Sever 종료는 터미널에서 ctrl + C
