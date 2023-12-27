const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
app.use(express.urlencoded({ extended: true }));

const axios = require('axios');
const crypto = require('crypto');
// const morgan = require('morgan');
const jwt = require('jsonwebtoken');

require('dotenv').config();


const secretKeyForToken = process.env.SECRET_KEY_FOR_TOKEN;
const clientSecret = process.env.CLIENT_SECRET;
const clientId = process.env.CLIENT_ID;

// console.log('secretKeyForToken', secretKeyForToken);

const authorizationCodes = {};
let userId = '';
let userJwt = '';


// app.use(morgan('dev'));

app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

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
    const response = await axios.post('https://smart.horynize.ru/api/users/auth', {
      username,
      password
    });

    if (response.status === 200 && response.data) {

      userId = response.data["0"]?.id_user; // Извлечение id пользователя из ответа
      userJwt = response.data["0"]?.jwt; // Извлечение jwt пользователя из ответа 
      console.log('userId', userId);
      console.log('userJwt', userJwt);
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
      try {
        await saveRefreshTokenToDatabase(userId, refreshToken);
      } catch (innerError) {
        console.error('Error saving refresh token:', innerError);
        // Обработка ошибки сохранения refresh token
      }
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
    throw error;
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


// Информация об устройствах пользователя
app.get('/v1.0/user/info', async (req, res) => {
  console.log('ЗАГОЛОВКИ ОТ ЯНДЕКСА', req.headers);

 res.send(
  {
    "status": "ok",
    "request_id": String,
    "rooms": [{
            "id": String,
            "name": String,
            "household_id": String,
            "devices": [String]
        },
        {
            "id": String,
            "name": String,
            "household_id": String,
            "devices": [String]
        }
    ],
    "groups": [{
        "id": String,
        "name": String,
        "aliases": [String],
        "household_id": String,
        "type": "devices.types.{type}",
        "devices": [String],
        "capabilities": [{
                "retrievable": Boolean,
                "type": "devices.capabilities.{capability}",
                "parameters": {},
                "state": {}
            },
            {
                "retrievable": Boolean,
                "type": "devices.capabilities.{capability}",
                "parameters": {},
                "state": {}
            }
        ]
    }],
    "devices": [{
            "id": String,
            "name": String,
            "aliases": [String],
            "type": "devices.types.{type}",
            "external_id": String,
            "skill_id": String,
            "household_id": String,
            "room": String,
            "groups": [String],
            "capabilities": [{
                    "reportable": Boolean,
                    "retrievable": Boolean,
                    "type": "devices.capabilities.{capability}",
                    "parameters": {},
                    "state": {},
                    "last_updated": Float
                },
                {
                    "reportable": Boolean,
                    "retrievable": Boolean,
                    "type": "devices.capabilities.{capability}",
                    "parameters": {},
                    "state": {},
                    "last_updated": Float
                }
            ],
            "properties": []
        },
        {
            "id": String,
            "name": String,
            "aliases": [String],
            "type": "devices.types.{type}",
            "external_id": String,
            "skill_id": String,
            "household_id": String,
            "room": String,
            "groups": [String],
            "capabilities": [{
                    "reportable": Boolean,
                    "retrievable": Boolean,
                    "type": "devices.capabilities.{capability}",
                    "parameters": {},
                    "state": {},
                    "last_updated": Float
                },
                {
                    "reportable": Boolean,
                    "retrievable": Boolean,
                    "type": "devices.capabilities.{capability}",
                    "parameters": {},
                    "state": {},
                    "last_updated": Float
                }
            ],
            "properties": []
        }
    ],
    "scenarios": [{
            "id": String,
            "name": String,
            "is_active": Boolean
        },
        {
            "id": String,
            "name": String,
            "is_active": Boolean
        }
    ],
    "households": [{
        "id": String,
        "name": String
    }]
}

 )
});


// POST /v1.0/user/devices/query Информация о состояниях устройств пользователя
app.post('/v1.0/user/devices/query', async (req, res) => {

  console.log('req.query', req.body);
  try {
    // Здесь должна быть ваша логика для получения состояний устройств
    const devicesStatus = {}; // Замените это объектом с состоянием ваших устройств
    res.status(200).send(devicesStatus);
  } catch (error) {
    console.error('Error querying device statuses:', error);
    res.status(500).send({ error: 'Error querying device statuses' });
  }
});

// POST /v1.0/user/devices/action Изменение состояния у устройств
// app.post('/v1.0/user/devices/action', async (req, res) => {
//   try {
//     // Здесь должна быть ваша логика для изменения состояния устройства
//     console.log('Device action requested', req.body);
//     // Выполните действие на основе тела запроса req.body
//     res.status(200).send({ message: 'Device action executed successfully' });
//   } catch (error) {
//     console.error('Error performing action on device:', error);
//     res.status(500).send({ error: 'Error performing action on device' });
//   }
// });

// const capabilities = [];

// // Пример добавления умения on_off
// capabilities.push({
//     "type": "devices.capabilities.on_off",
//     "retrievable": true,
//     "reportable": true,
//     "parameters": {
//         // здесь могут быть дополнительные параметры, если они требуются
//     }
// });

// // Пример добавления умения mode
// capabilities.push({
//     "type": "devices.capabilities.mode",
//     "retrievable": true,
//     "reportable": true,
//     "parameters": {
//         // Параметры для режима работы, например, для кондиционера
//     }
// });

// // Пример добавления умения range
// capabilities.push({
//     "type": "devices.capabilities.range",
//     "retrievable": true,
//     "reportable": true,
//     "parameters": {
//         "instance": "brightness",
//         "unit": "unit.percent",
//         "range": {
//             "min": 0,
//             "max": 100,
//             "precision": 1
//         }
//     }
// });

// // Пример добавления умения toggle
// capabilities.push({
//     "type": "devices.capabilities.toggle",
//     "retrievable": true,
//     "reportable": true,
//     "parameters": {
//         // Параметры для переключателя, если они требуются
//     }
// });


// Конечно, вы должны заполнить массив capabilities данными, полученными от вашего API.
// Например, если у вас есть объект device, который содержит информацию о возможностях устройства, вы можете преобразовать его следующим образом:
// const deviceCapabilities = device.capabilities.map(capability => {
//     return {
//         "type": capability.type,
//         "retrievable": capability.retrievable,
//         "reportable": capability.reportable,
//         "parameters": capability.parameters
//     };
// });







app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});