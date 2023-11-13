const express = require('express');
const app = express();
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

// DB 연결을 위해 models/index.js 파일에 있는 sequelize 연결 객체와 사용할 테이블(객체 모델)들을를 불러온다.
const { sequelize, User } = require('./models');
const cookieParser = require('cookie-parser');

// const { signup } = require('./controllers/user.controller');


app.use(morgan('dev'));

app.use(cookieParser());
app.use(cors({
  origin: 'http://localhost:3000', // 클라이언트의 주소를 입력하세요.
  methods: ['GET', 'POST'],
  credentials: true
}));

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
    // ! user.id 를 이용해서 쿠키를 발행해야 함.
    // 유저를 찾았다면 로그인 성공 메시지와 함께 이메일 정보도 전달
    res.json({ result: 'Login success', email: user.email });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 에러' });
  }
});




// 연결 객체를 이용해 DB 와 연결한다. sync 옵션은 원노트를 참조한다.
sequelize
  .sync({ force: false })
  .then(() => console.log('DB is ready'))
  .catch((e) => console.log(e));

const port = process.env.PORT || 8081;
app.listen(port, () => console.log(`Server is running on port ${port}`));

// http://localhost:8080/
// Sever 종료는 터미널에서 ctrl + C
