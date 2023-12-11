// default 값으로 화살표 함수 내보내기.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'User',
    {
      email: {
        type: DataTypes.STRING(40),
        // ? 원래는 true 로 설정해서 중복된 이메일이 등록되는 것을 방지해야 하지만 로컬에서 provider 값을 이용해서 회원 가입할 때 이메일이 중복으로 적용되는 경우가 있으므로 여기에서는 주석 처리함.
        // unique: true,
      },
      password: {
        type: DataTypes.STRING(100),
        validate: {
          len: {
            args: [5],
            msg: 'Password length should be greater than 5',
          },
        },
      },
      provider: {
        type: DataTypes.ENUM('Email', 'Google', 'Kakao'),
        // allowNull: false,
        // defaultValue: 'Email',
      },
      googleId: {
        type: DataTypes.STRING(30),
        unique: true,
      },
      kakaoId: {
        type: DataTypes.STRING(30),
        unique: true,
      },
      token: {
        type: DataTypes.STRING(6),
      },
      verified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      // ? timestamps 기본값은 true: createdAt, updatedAt 칼럼 자동 생성.
      // timestamps: false,
    },
  );
};
