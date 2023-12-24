const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

let userId = '';
let userJwt = '';

router.post('/v1.0/auth', async (req, res) => {

  try {
    const { username, password, client_id, redirect_uri, state } = req.body;

    // Отправляем запрос на PHP-сервер для аутентификации
    const response = await axios.post('https://smart.horynize.ru/api/users/auth', {
      username,
      password
    });

    if (response.status === 200 && response.data) {

      userId = response.data["0"]?.id_user; // Извлечение id пользователя из ответа
      userJwt = response.data["0"]?.jwt; // Извлечение jwt пользователя из ответа 

      // Успешная аутентификация, генерируем код авторизации
      const authCode = crypto.randomBytes(16).toString('hex'); // Простая генерация кода
      const expiresIn = 600; // Время жизни кода в секундах (например, 2 минуты)


      // Сохраняем код в памяти с указанием времени истечения
      authorizationCodes[authCode] = {
        clientId: client_id,
        expiresAt: Date.now() + expiresIn * 1000,
        userId: userId,
        // Дополнительные данные, если необходимо, например, jwt
      };

      // Устанавливаем таймер для удаления кода по истечении времени
      setTimeout(() => delete authorizationCodes[authCode], expiresIn * 1000);

      // Перенаправляем пользователя обратно на redirect_uri с кодом авторизации
      const redirectUrl = `${redirect_uri}?client_id=${client_id}&state=${state}&code=${authCode}`;
      res.redirect(redirectUrl);
    } else {
      res.send('Ошибка аутентификации');
    }
  } catch (error) {
    console.log(error);
    res.send('Произошла ошибка при аутентификации');
  }
});

module.exports = router;