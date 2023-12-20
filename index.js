const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
app.use(express.urlencoded({ extended: true }));
const axios = require('axios');
const crypto = require('crypto');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');

const secretKeyForToken = process.env.SECRET_KEY_FOR_TOKEN;
const clientSecret = process.env.CLIENT_SECRET;
const clientId = process.env.CLIENT_ID;

const authorizationCodes = {};
let userId = '';
const internalToken = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2hvcnluaXplLmV1cm9kaXIucnUiLCJhdWQiOiJodHRwczovL2hvcnluaXplLmV1cm9kaXIucnUiLCJpYXQiOjE3MDMwNDY1MzUsIm5iZiI6MTcwMzA0NjUzNSwiZXhwIjoxNzAzMDU0MzM1LCJkYXRhIjp7ImlkX3VzZXIiOjIzLCJ1c2VybmFtZSI6IlZpY3RvcnVuaTEiLCJlbWFpbCI6InR1cmJvZWRhQGdtYWlsLmNvbSJ9fQ.-ONF-Z__v4aeiUlH2S6fdJNzJ6uhUr3qMROKiSi-2mw";


app.use(morgan('dev'));

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
    const response = await axios.post('https://smart.horynize.ru/api/users/auth.php', {
      username,
      password
    });

    // console.log('responseauth', response.data);

    if (response.status === 200 && response.data) {

      userId = response.data?.user[0]?.id_user; // Извлечение id пользователя из ответа

      // Успешная аутентификация, генерируем код авторизации
      const authCode = crypto.randomBytes(16).toString('hex'); // Простая генерация кода
      const expiresIn = 600; // Время жизни кода в секундах (например, 10 минут)


      // Сохраняем код в памяти с указанием времени истечения
      authorizationCodes[authCode] = {
        clientId: client_id,
        expiresAt: Date.now() + expiresIn * 1000,
        userId: userId
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
  const { code, client_id } = req.body;

  const codeData = authorizationCodes[code];

  if (codeData && Date.now() < codeData.expiresAt && codeData.clientId === client_id) {
    const userId = codeData.userId; // Вытаскиваем userId из кода

    // Генерируем токены
    const accessToken = jwt.sign({ userId: userId }, secretKeyForToken, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ userId: userId }, secretKeyForToken, { expiresIn: '7d' });

    // Сохраняем refresh token в базу данных
    await saveRefreshTokenToDatabase(userId, refreshToken);

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600, // 1 час
    });
  } else {
    res.status(400).json({ error: 'Invalid or expired authorization code' });
  }
});

app.post('/v1.0/refresh_token', async (req, res) => {
  const { refresh_token } = req.body;
  try {
    // Проверяем refresh_token
    const decoded = jwt.verify(refresh_token, secretKeyForToken);

    const tokenIsValid = await checkRefreshTokenInDatabase(decoded.userId, refresh_token);

    if (tokenIsValid) {
      // Генерируем новый access_token
      const accessToken = jwt.sign({ userId: decoded.userId }, secretKeyForToken, { expiresIn: '1h' });

      res.json({
        access_token: accessToken,
        expires_in: 3600, // 1 час
      });
    } else {
      throw new Error('Invalid refresh token');
    }
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});


// Сохраняем рефреш токен в базу
async function saveRefreshTokenToDatabase(userId, refreshToken) {
  try {
    const response = await axios.post('https://smart.horynize.ru/api/users/token_save.php', {
      userId: Number(userId),
      tokenYandex: refreshToken
    });

    if (response.status !== 200) {
      throw new Error('Failed to save refresh token');
    }

    console.log('Refresh token saved successfully');
  } catch (error) {
    console.error('Error saving refresh token:', error);
    throw error; // Выбрасываем ошибку для обработки на более высоком уровне
  }
}

// Проверяем рефреш токен в базе
async function checkRefreshTokenInDatabase(userId, refreshToken) {
  try {
    const response = await axios.post('https://smart.horynize.ru/api/users/check_refresh_token.php', {
      userId: Number(userId),
      tokenYandex: refreshToken
    });

    if (response.data && response.data.valid) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error('Error checking refresh token:', error);
    return false; // В случае ошибки считаем токен недействительным
  }
}


//Информация об устройствах пользователя
app.get('/v1.0/user/devices', async (req, res) => {
  try {
    const responseUserDevices = await axios.post('https://smart.horynize.ru/api/all-vent-units.php', {
    "userId": Number(userId),
    "status": '1'
}, {
    headers: {
        'Authorization': `Bearer ${internalToken}`
    }
});

    if (responseUserDevices.data ) {
      return responseUserDevices;
    } else {
      return error;
    }
  } catch (error) {
    console.error('', error);
  }
})





app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});