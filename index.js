require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const authRouter = require('./routers/authRouter');
const refreshTokenRouter = require('./routers/refreshTokenRouter');
const tokenRouter = require('./routers/tokenRouter');
const userDevicesRouter = require('./routers/userDevicesRouter');
const loginRouter = require('./routers/loginRouter');



app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Подключение роутеров
app.use(loginRouter);
app.use(authRouter);
app.use(refreshTokenRouter);
app.use(tokenRouter);
app.use(userDevicesRouter);



app.get('/', (req, res) => {
  res.send('Hello World!');
});

// HEAD /v1.0/ Проверка доступности Endpoint URL провайдера
app.head('/v1.0/', (req, res) => {
  res.status(200).send();
});

// POST /v1.0/user/unlink Оповещение о разъединении аккаунтов
app.post('/v1.0/user/unlink', async (req, res) => {
  try {
    // Здесь должна быть ваша логика для обработки разъединения аккаунтов
    console.log('User account unlinked');
    res.status(200).send({ message: 'Account successfully unlinked' });
  } catch (error) {
    console.error('Error unlinked account:', error);
    res.status(500).send({ error: 'Error unlinked account' });
  }
});








app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});