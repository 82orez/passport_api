const Sequelize = require('sequelize');
const dotenv = require('dotenv');
dotenv.config();
const env = process.env.NODE_ENV || 'development';
const config = require('../config/config')[env];
const db = {};

// mysql 연결을 위한 연결 객체 생성.
const sequelize = new Sequelize(config.database, config.username, config.password, config);

// 연결 객체를 db 객체에 저장.
db.sequelize = sequelize;

// Sequelize 라이브러리 자체를 db 객체에 같이 저장. 이렇게 하면 테이블(객체 모델)을 생성할 때 따로 Sequelize 라이브러리를 불러오지 않아도 됨.
db.Sequelize = Sequelize;

// 생성된 테이블들을 불러와서 연결 객체와 라이브러리 자체를 인수로 넣어 주고 db 객체에 저장.
db.Customer = require('./customer')(sequelize, Sequelize);
db.Purchase = require('./purchase')(sequelize, Sequelize);
db.User = require('./user.model')(sequelize, Sequelize);

// 테이블 간에 관계 설정.
db.Customer.hasMany(db.Purchase, { foreignKey: 'customer_id', sourceKey: 'id' });
db.Purchase.belongsTo(db.Customer, { foreignKey: 'customer_id', targetKey: 'id' });

module.exports = db;