// default 값으로 화살표 함수 내보내기.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'Purchase',
    {
      customer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      book_name: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      purchase_date: {
        type: 'TIMESTAMP',
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        allowNull: false,
      },
    },
    {
      freezeTableName: true,
      timestamps: false,
    },
  );
};
