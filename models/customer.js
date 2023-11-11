// default 값으로 화살표 함수 내보내기.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'Customer',
    {
      name: {
        type: DataTypes.STRING(20), // 데이터 타입 정의
        allowNull: false, // Null 허용 여부 정의
      },
      age: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      sex: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      joined_date: {
        type: 'TIMESTAMP',
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        allowNull: false,
      },
    },
    {
      timestamps: false,
    },
  );
};
