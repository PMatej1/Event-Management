const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'Upravljanje_dogadjajima',
    password: '12345678',
    port: 5432,
});

module.exports = pool;