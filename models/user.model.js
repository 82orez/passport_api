// default 값으로 화살표 함수 내보내기.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'User',
    {
      email: {
        type: DataTypes.STRING(40),
        unique: true
      },
      password: {
        type: DataTypes.STRING(100),
        validate: {
          len: {
            args: [5],
            msg: "Password length should be greater than 5"
          }
        }
      },
      googleId: {
        type: DataTypes.STRING(30),
        unique: true
      },
      kakaoId: {
        type: DataTypes.STRING(30),
        unique: true
      }
    },
    {
      timestamps: false,
    },
  );
};
