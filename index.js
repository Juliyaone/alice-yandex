const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
app.use(express.urlencoded({ extended: true }));

const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

require("dotenv").config();


const secretKeyForToken = process.env.SECRET_KEY_FOR_TOKEN;
// const clientSecret = process.env.CLIENT_SECRET;
// const clientId = process.env.CLIENT_ID;
// console.log('secretKeyForToken', secretKeyForToken);

const authorizationCodes = {};
let userId = "";
let userJwt = "";
let controllersArray = [];
let controllersArrayYandex = [];

console.log(("controllersArray", controllersArray));

app.use(express.json());

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});


app.get("/", (req, res) => {
  res.send("Hello World!");
});

// HEAD /v1.0/ Проверка доступности Endpoint URL провайдера
app.head("/v1.0", (req, res) => {
  try {
    res.status(200).end();
  } catch (error) {
    console.error("Internal Server Error", error);
    res.status(500).end();
  }
});

// POST /v1.0/user/unlink Оповещение о разъединении аккаунтов
app.post("/v1.0/user/unlink", async (req, res) => {
  try {
    // Здесь должна быть ваша логика для обработки разъединения аккаунтов
    console.log("User account unlinked");
    res.status(200).send({ message: "Account successfully unlinked" });
  } catch (error) {
    console.error("Error unlinked account:", error);
    res.status(500).send({ error: "Error unlinked account" });
  }
});

// Страница авторизации
app.get("/v1.0/login", (req, res) => {
 
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

app.post("/v1.0/auth", async (req, res) => {
  try {
    const { username, password, client_id, redirect_uri, state } = req.body;

    // Отправляем запрос на PHP-сервер для аутентификации
    const response = await axios.post("https://smart.horynize.ru/api/users/auth", {
      username,
      password
    });

    if (response.status === 200 && response.data) {

      userId = response.data["0"]?.id_user; // Извлечение id пользователя из ответа
      userJwt = response.data["0"]?.jwt; // Извлечение jwt пользователя из ответа 
      controllersArray = response.data.controllers[1]; // Извлечение id_controller пользователя из ответа
      
      console.log("userId", userId);
      console.log("userJwt", userJwt);
      console.log("response.data", response.data);
      // Успешная аутентификация, генерируем код авторизации
      const authCode = crypto.randomBytes(16).toString("hex"); // Простая генерация кода
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
      res.send("Ошибка аутентификации");
    }
  } catch (error) {
    console.log(error);
    res.send("Произошла ошибка при аутентификации");
  }
});

// Эндпоинт для обмена кода авторизации на токены
app.post("/v1.0/token", async (req, res) => {
  const { code, client_id } = req.body;

  const codeData = authorizationCodes[code];

  if (codeData && Date.now() < codeData.expiresAt && codeData.clientId === client_id) {
    const userId = codeData.userId; // Вытаскиваем userId из кода

    // Генерируем токены
    const accessToken = jwt.sign({ userId: userId }, secretKeyForToken, { expiresIn: "1h" });
    const refreshToken = jwt.sign({ userId: userId }, secretKeyForToken, { expiresIn: "7d" });

    // Сохраняем refresh token в базу данных
    try {
      await saveRefreshTokenToDatabase(userId, refreshToken);
    } catch (innerError) {
      console.error("Error saving refresh token:", innerError);
      // Обработка ошибки сохранения refresh token
    }
    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600, // 1 час
    });
  } else {
    res.status(400).json({ error: "Invalid or expired authorization code" });
  }
});

app.post("/v1.0/refresh_token", async (req, res) => {
  const { refresh_token } = req.body;
  try {
    // Проверяем refresh_token
    const decoded = jwt.verify(refresh_token, secretKeyForToken);

    const tokenIsValid = await checkRefreshTokenInDatabase(decoded.userId, refresh_token);

    if (tokenIsValid) {
      // Генерируем новый access_token
      const accessToken = jwt.sign({ userId: decoded.userId }, secretKeyForToken, { expiresIn: "1h" });

      res.json({
        access_token: accessToken,
        expires_in: 3600, // 1 час
      });
    } else {
      throw new Error("Invalid refresh token");
    }
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

// Информация об устройствах пользователя
app.get("/v1.0/user/devices", async (req, res) => {

  try {
    // Здесь нужно получить userID и JWT токен из запроса, предполагается, что они передаются в заголовках
    const userJwtYandex = req.headers["authorization"];
    const requestId = req.headers["x-request-id"];
    // const userID = req.headers['userID'];
    
    // Делаем запрос на ваш внутренний API для получения списка устройств
    const responseUserDevices = await axios.post("https://smart.horynize.ru/api/vent-units/all", {
      "userId": String(userId),
      "status": "1"
    }, {
      headers: {
        "Authorization": `Bearer ${userJwt}`
      }
    });

    // console.log("responseUserDevices", responseUserDevices);

    // Отправляем ответ
    res.json(
      {
        "request_id": requestId,
        "payload": {
          "user_id": String(userId),
          "devices": [
            {
              "id": "kagdfjijp4e65896748763qmfiouybnoivy",
              "name": "Установка имя",
              "description": "Установка описание",
              "room": "Установка комната",
              "type": "devices.types.thermostat.ac",
              // "custom_data": Object,
              "capabilities": [{
                "type": "devices.capabilities.range",
                "retrievable": true,
                "parameters": {
                  "instance": "temperature",
                  "random_access": true,
                  "range": {
                    "max": 30,
                    "min": 15,
                    "precision": 1
                  },
                  "unit": "unit.temperature.celsius"
                }
              },
              {
                "type": "devices.capabilities.mode",
                "retrievable": true,
                "parameters": {
                  "instance": "fan_speed",
                  "modes": [{
                    "value": "high"
                  },
                  {
                    "value": "medium"
                  },
                  {
                    "value": "low"
                  },
                  {
                    "value": "auto"
                  }
                  ]
                }
              },
              {
                "type": "devices.capabilities.mode",
                "retrievable": true,
                "parameters": {
                  "instance": "thermostat",
                  "modes": [{
                    "value": "fan_only"
                  },
                  {
                    "value": "heat"
                  },
                  {
                    "value": "cool"
                  },
                  {
                    "value": "dry"
                  },
                  {
                    "value": "auto"
                  }
                  ]
                }
              },
              {
                "type": "devices.capabilities.on_off",
                "retrievable": true
              }
              ],
              "properties": [{
                "type": "devices.properties.float",
                "retrievable": true,
                "parameters": {
                  "instance": "temperature",
                  "unit": "unit.temperature.celsius"
                }
              }],
              "device_info": {
                "manufacturer": "Horynize",
                "model": "sf-350",
              }
            },
          ]
        }
      }
    );

  } catch (error) {
    // Логируем ошибку для дальнейшего анализа
    console.error("Error fetching devices:", error);

    // Отправляем ошибку в ответе
    res.status(500).json({
      request_id: req.headers["x-request-id"], // Возвращаем тот же request_id что и получили
      error_code: "INTERNAL_ERROR",
      error_message: "Internal server error"
    });
  }
});

// Информация о состояниях устройств пользователя
app.post("/v1.0/user/devices/query", async (req, res) => {
  const userJwtYandex = req.headers.authorization;
  const requestId = req.headers["x-request-id"];
  const сontentType = req.headers["Content-Type"];

  console.log("req.body", req.body);

  // 2024-01-12T01:30:21.042 app[6e8242e5c55958] ams [info] req.body { devices: [ { id: 'kagdfjijp4e65896748763qmfiouybnoivy' } ] }



  try {
    // Извлекаем массив устройств из тела запроса
    const controllersArrayYandex = req.body.devices;
    console.log("controllersArrayYandex", controllersArrayYandex);

    // Получение состояний устройств
    const devicesStatus = await getDevicesRequested();
    console.log("devicesStatus", devicesStatus);

    // Формирование ответа


  // ожидаемый ответ {"vent-unit":[{"id_vent-unit":"20"}],"data":[{"enabled":"1","res":2,"tempChannel":29.89999999999999857891452847979962825775146484375,"ZagrFiltr":92,"fanSpeedP":1,"fanSpeedV":0,"tempRoom":19.300000000000000710542735760100185871124267578125,"humRoom":19,"co2Room":0,"tempTarget":30,"fanSpeedPTarget":1,"fanSpeedVTarget":0,"humRoomTarget":35,"co2RoomTarget":0,"mode":1}]}

    const responsePayload = devicesStatus["data"].map(deviceData => ({
      "id": controllersArrayYandex[0].id, // Используйте правильный ID устройства
      "capabilities": [
        {
          "type": "devices.capabilities.on_off",
          "state": {
            "instance": "on",
            "value": deviceData["enabled"] === "1"
          },
          "retrievable": true
        },
        {
          "type": "devices.capabilities.range",
          "state": {
            "instance": "temperature",
            "value":  String(Math.floor(deviceData["tempChannel"]))
          },
          "retrievable": true
        }
        // Добавьте другие возможности устройства в соответствии с их состоянием
      ],
      "properties": [
        {
          "type": "devices.properties.float",
          "state": {
            "instance": "temperature",
            "value": String(Math.floor(deviceData["tempRoom"]))
          }
        }
        // Добавьте другие свойства устройства
      ]
    }));

    res.json({
      "request_id": String(requestId),
      "payload": {
        "devices": responsePayload
      }
    });
  } catch (error) {
    console.error("Error querying device statuses:", error);
    res.status(500).send({ error: "Error querying device statuses" });
  }
});



// Изменение состояния у устройств
app.post("/v1.0/user/devices/action", async (req, res) => {
  try {
    // Здесь должна быть ваша логика для изменения состояния устройства
    // console.log("Device action requested", req.body);
    // Выполните действие на основе тела запроса req.body
    res.status(200).send({ message: "Device action executed successfully" });
  } catch (error) {
    console.error("Error performing action on device:", error);
    res.status(500).send({ error: "Error performing action on device" });
  }
});


// Сохраняем рефреш токен в базу
async function saveRefreshTokenToDatabase(userId, refreshToken) {
  try {
    const response = await axios.post("https://smart.horynize.ru/api/users/token_save.php", {
      userId: Number(userId),
      tokenYandex: refreshToken
    });

    if (response.status !== 200) {
      throw new Error("Failed to save refresh token");
    }

    console.log("Refresh token saved successfully");
  } catch (error) {
    console.error("Error saving refresh token:", error);
    throw error;
  }
}

// Проверяем рефреш токен в базе
async function checkRefreshTokenInDatabase(userId, refreshToken) {
  try {
    const response = await axios.post("https://smart.horynize.ru/api/users/check_refresh_token.php", {
      userId: Number(userId),
      tokenYandex: refreshToken
    });

    if (response.data && response.data.valid) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error("Error checking refresh token:", error);
    return false; // В случае ошибки считаем токен недействительным
  }
}
// Получаем параметры устройств
async function getDevicesRequested() {
  const responseGetDevicesRequested = await axios.post("https://smart.horynize.ru/api/vent-units/getparams", {
    "controllerId": "20"
  }, {
    headers: {
      "Authorization": `Bearer ${userJwt}`
    }
  });

  console.log("responseGetDevicesRequested", responseGetDevicesRequested);

  return responseGetDevicesRequested;


  // ожидаемый ответ {"vent-unit":[{"id_vent-unit":"20"}],"data":[{"enabled":"1","res":2,"tempChannel":29.89999999999999857891452847979962825775146484375,"ZagrFiltr":92,"fanSpeedP":1,"fanSpeedV":0,"tempRoom":19.300000000000000710542735760100185871124267578125,"humRoom":19,"co2Room":0,"tempTarget":30,"fanSpeedPTarget":1,"fanSpeedVTarget":0,"humRoomTarget":35,"co2RoomTarget":0,"mode":1}]}
  
}



app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});