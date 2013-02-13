module.exports = {
  host: process.env.MONGO_HOST || 'localhost',
  port: process.env.MONGO_PORT || 27017,
  dbname: process.env.MONGO_DBNAME || 'test',
  username: process.env.MONGO_USERNAME || null,
  password: process.env.MONGO_PASSWORD || null
}