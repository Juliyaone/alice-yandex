const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
app.use(express.urlencoded({ extended: true }));
const axios = require('axios');
const crypto = require('crypto');

const authorizationCodes = {};
let userId = '';

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Страница авторизации
app.get('/v1.0/login', (req, res) => {
 
  const { client_id, redirect_uri, state } = req.query;
  // Отображаем форму для ввода логина и пароля

  res.send(`
    <form action="/v1.0/auth" method="post">
      <input type="hidden" name="client_id" value="${client_id}">
      <input type="hidden" name="redirect_uri" value="${redirect_uri}">
      <input type="hidden" name="state" value="${state}">

      <label for="username">Логин:</label>
      <input type="text" id="username" name="username"><br>
      <label for="password">Пароль:</label>
      <input type="password" id="password" name="password"><br>
      <input type="submit" value="Войти">
    </form>
  `);
});

app.post('/v1.0/auth', async (req, res) => {
  try {
    const { username, password, client_id, redirect_uri, state } = req.body;
    // Отправляем запрос на PHP-сервер для аутентификации
    const response = await axios.post('http://smart.horynize.ru/api/users/auth.php', {
      username,
      password
    });

    if (response.status === 200 && response.data && response.data[0] && response.data[0].id_user) {

      userId = response.data[0].id_user; // Извлечение id пользователя из ответа
      // Успешная аутентификация, генерируем код авторизации
      const authCode = crypto.randomBytes(16).toString('hex'); // Простая генерация кода
      const expiresIn = 600; // Время жизни кода в секундах (например, 10 минут)


      // Сохраняем код в памяти с указанием времени истечения
      authorizationCodes[authCode] = {
        clientId: client_id,
        expiresAt: Date.now() + expiresIn * 1000,
        // Дополнительные данные, если необходимо, например, userId
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

// Эндпоинт для обмена кода авторизации на токены
app.post('/v1.0/token', async (req, res) => {
 const { code, client_id, client_secret } = req.body;

  const codeData = authorizationCodes[code];

    if (codeData && Date.now() < codeData.expiresAt && codeData.clientId === client_id) {

    // Генерируем токены
    const accessToken = crypto.randomBytes(32).toString('hex'); // Простая генерация токена доступа

    // Сохраняем токен в базу
    const response = await axios.post('http://smart.horynize.ru/api/users/token_save.php', {
      userId: Number(userId),
      tokenYandex: accessToken,
    });

    const refreshToken = crypto.randomBytes(32).toString('hex'); // Простая генерация refresh токена


    if (response.status === 200) {

      // Отправляем токены обратно
      res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600, // 1 час, к примеру
      });
    }
  } else {
    res.status(400).json({ error: 'Invalid request' });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});