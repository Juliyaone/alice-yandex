const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
app.use(express.urlencoded({ extended: true }));

const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

require("dotenv").config();


const secretKeyForToken = process.env.SECRET_KEY_FOR_TOKEN;

const authorizationCodes = {};

let userId = "";

let userJwt = "";
let userJwtYandex ="";

let devicesArray = [];

let devicesArrayYandex = [];

let userDevicesParams = [];


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
// app.get("/v1.0/login", (req, res) => {
 
//   const { client_id, redirect_uri, state } = req.query;
//   // Отображаем форму для ввода логина и пароля

//   res.send(`
//     <form action="/v1.0/auth" method="post">
//       <input type="hidden" name="client_id" value="${client_id}">
//       <input type="hidden" name="redirect_uri" value="${redirect_uri}">
//       <input type="hidden" name="state" value="${state}">

//       <label for="username">Логин:</label>
//       <input type="text" id="username" name="username"><br>
//       <label for="password">Пароль:</label>
//       <input type="password" id="password" name="password"><br>
//       <input type="submit" value="Войти">
//     </form>
//   `);
// });
// Страница авторизации
app.get("/v1.0/login", (req, res) => {
  const { client_id, redirect_uri, state } = req.query;

  // Встроенные стили
  const style = `
    <style>
      body {
        font-family: 'Arial', sans-serif;
        background-color: #f7f7f7;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
      }
      form {
        background-color: #fff;
        padding: 20px;
        border-radius: 5px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }
      label {
        display: block;
        margin-bottom: 5px;
      }
      input[type="text"],
      input[type="password"] {
        width: 100%;
        padding: 10px;
        margin-bottom: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-sizing: border-box; /* So that the width includes padding */
      }
      input[type="submit"] {
        background-color: #5cacf9;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
      }
      input[type="submit"]:hover {
        background-color: #4a9cdf;
      }
    </style>
  `;

  // HTML с встроенными стилями
  res.send(`
    ${style}
    <form action="/v1.0/auth" method="post">
      <input type="hidden" name="client_id" value="${client_id}">
      <input type="hidden" name="redirect_uri" value="${redirect_uri}">
      <input type="hidden" name="state" value="${state}">
      <div>
        <label for="username">Логин:</label>
        <input type="text" id="username" name="username">
      </div>
      <div>
        <label for="password">Пароль:</label>
        <input type="password" id="password" name="password">
      </div>
      <div>
        <input type="submit" value="Войти">
      </div>
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
      devicesArray = response.data.controllers[1]; // Извлечение id_controller пользователя из ответа
      
      // console.log("userId", userId);
      // console.log("userJwt", userJwt);
      // console.log("response.data", response.data);
      console.log(("devicesArray", devicesArray));

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
  console.log("Информация об устройствах пользователя app.get/v1.0/user/devices");

  try {

    userJwtYandex = req.headers["authorization"];
    const requestId = req.headers["x-request-id"];
    
    // Запрос на получение списка устройств
    const getUserDevicesResponse = await fetchUserDevices(userId, userJwt);

    const ventUnits = getUserDevicesResponse.data["vent-units"];
    console.log("ventUnits", ventUnits);

    let devices = [];

    for (const ventUnit of ventUnits) {
      // Запрос на получение параметров устройства
      const getUserDevicesParamsResponse = await fetchDeviceParams(ventUnit.id_controller, userJwt);

      const availableModes = getAvailableModes(getUserDevicesParamsResponse.data.data[0].avalibleMode);


      let enabled = getUserDevicesParamsResponse.data.data[0].enabled === "1" ? true : false;

      // Добавляем устройство в массив devices
      devices.push({
        "id": String(ventUnit.id_controller),
        "name": "Вентиляционная установка",
        "description": "",
        "room": "",
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
            },
            {
              "value": "turbo"
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
        "properties": [
          {
            "type": "devices.properties.float",
            "retrievable": true,
            "parameters": {
              "instance": "temperature",
              "unit": "unit.temperature.celsius"
            }
          },{
            "type": "devices.properties.float",
            "retrievable": true,
            "parameters": {
              "instance": "humidity",
              "unit": "unit.percent"
            }
          },
        ],
        "device_info": {
          "manufacturer": "Horynize",
          "model": String(ventUnit.name),
        }
      });
    }
    
    // отправляем ответ

    // console.log("ответ яндексу об устройствах пользователя",  JSON.stringify({
    //   "request_id": requestId,
    //   "payload": {
    //     "user_id": String(userId),
    //     "devices": devices
    //   }
    // }, null, 2));
    
    res.json({
      "request_id": requestId,
      "payload": {
        "user_id": String(userId),
        "devices": devices
      }
    });

  } catch (error) {
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
  console.log("Информация о состояниях устройств пользователя app.get/v1.0/user/devices/query");

  userJwtYandex = req.headers.authorization;
  const requestId = req.headers["x-request-id"];

  try {
    // Извлекаем массив устройств из тела запроса
    const devicesArrayYandex = req.body.devices;
    console.log("devicesArrayYandex", devicesArrayYandex);

    let devicesPayload = [];

    for (const device of devicesArrayYandex) {

      // Запрос на получение параметров устройства
      const getDevicesParamsResponse = await fetchDeviceParams(device.id, userJwt);

      // Проверяем наличие данных
      if (getDevicesParamsResponse.data && getDevicesParamsResponse.data.data.length > 0) {
        const deviceData = getDevicesParamsResponse.data.data[0];
        console.log("deviceData", deviceData);

        let availableModes = getAvailableModes(deviceData.avalibleMode);
        console.log("availableModes", availableModes);

        let enabledData = deviceData.enabled == "1" ? true : false;
        console.log("enabledData", enabledData);

        let tempTargetData = Math.floor(deviceData.tempTarget);
        console.log("tempTargetData", tempTargetData);

        let tempRoomData = Math.floor(deviceData.tempRoom);
        console.log("tempRoomData", tempRoomData);

        let humRoomData = Math.floor(deviceData.humRoom);
        console.log("humRoom", humRoomData);

        const fanSpeedMapForYandex = {
          "2": "low",
          "4": "auto",
          "6": "medium",
          "8": "high",
          "10": "turbo"
        };
        let fanSpeedPData = deviceData.fanSpeedP;
        fanSpeedPData = fanSpeedMapForYandex[fanSpeedPData] || fanSpeedPData;
        console.log("fanSpeedPData", fanSpeedPData);

        const modeMap = {
          "1": "fan_only",
          "2": "cool",
          "3": "heat",
          "4": "auto"
        };
        let modeData = deviceData.res;
        modeData = modeMap[modeData] || modeData;
        console.log("modeData", modeData);
      
        // Здесь формируется состояние устройства в соответствии с полученными данными
        devicesPayload.push({
          "id": device.id,
          "capabilities": [
            {
              "type": "devices.capabilities.range",
              "state": {
                "instance": "temperature",
                "value": tempTargetData
              }
            },
            {
              "type": "devices.capabilities.range",
              "state": {
                "instance": "humidity",
                "value": humRoomData
              }
            },
            {
              "type": "devices.capabilities.mode",
              "state": {
                "instance": "fan_speed",
                "value": fanSpeedPData
              } 
            },
            {
              "type": "devices.capabilities.mode",
              "state": {
                "instance": "thermostat",
                "value": modeData
              } 
            },
            {
              "type": "devices.capabilities.on_off",
              "state": {
                "instance": "on",
                "value": enabledData
              }
            },
          ],
          "properties": [
            {
              "type": "devices.properties.float",
              "state": {
                "instance": "humidity",
                "value": humRoomData
              }
            }, {
              "type": "devices.properties.float",
              "state": {
                "instance": "temperature",
                "value": tempRoomData
              }
            }
          ]
        });
      }
    }

    // console.log("ответ яндексу о состояниях устройств пользователя", JSON.stringify({
    //   "request_id": String(requestId),
    //   "payload": {
    //     "devices": devicesPayload,
    //   },
    // }, null, 2));

    // Отправляем ответ
    res.json({
      "request_id": String(requestId),
      "payload": {
        "devices": devicesPayload,
      },
    });
  } catch (error) {
    console.error("Error querying device statuses:", error);
    res.status(500).send({ error: "Error querying device statuses" });
  }
});


// Изменение состояния у устройств
app.post("/v1.0/user/devices/action", async (req, res) => {
  console.log("Изменение состояния у устройств пользователя");
  try {
    const actions = req.body.payload.devices;
    let results = [];

    for (const action of actions) {
      const deviceId = action.id;
      const capabilities = action.capabilities;
      const params = { controllerId: String(deviceId) };

      capabilities.forEach((capability) => {
        const handler = handlersChangeParams[capability.type];
        if (handler) {
          handler(capability, params);
        }
      });

      await fetchDeviceChangeParams(params, userJwt); // Вызов функции изменения параметров

      results.push({
        id: deviceId,
        status: "DONE" // или "ERROR" в случае ошибки
      });
    }

    res.json({
      request_id: req.headers["x-request-id"],
      payload: {
        devices: results
      }
    });
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

// Функция для запроса списка устройств
async function fetchUserDevices(userId, userJwt) {
  return await axios.post("https://smart.horynize.ru/api/vent-units/all", {
    "userId": String(userId),
    "status": "1"
  }, {
    headers: {
      "Authorization": `Bearer ${userJwt}`,
      "Content-Type": "application/json"
    }
  });
}

// Функция для запроса параметров устройства
async function fetchDeviceParams(controllerId, userJwt) {

  return await axios.post("https://smart.horynize.ru/api/vent-units/getparams", {
    "controllerId": String(controllerId),
  }, {
    headers: {
      "Authorization": `Bearer ${userJwt}`,
      "Content-Type": "application/json"
    }
  });
}

// Функция для изменения параметров устройства
async function fetchDeviceChangeParams(params, userJwt) {
  try {

    console.log("params", params);
    console.log("userJwtPARAMS", userJwt);


    const response = await axios.post("https://smart.horynize.ru/api/vent-units/setparams", params, {
      headers: {
        "Authorization": `Bearer ${userJwt}`,
        "Content-Type": "application/json"
      }
    });

    // Обработка успешного ответа
    // if (response.data && response.data.message === " command send ") {
    console.log("Command sent successfully");
    return response.data;
    // } else {
    //   throw new Error("Unexpected response from API");
    // }
  } catch (error) {
    console.error("Error sending parameters:", error);
    throw error;
  }
}

// Объекты карты для соответствия значений
const fanSpeedMapForApi = {
  "low": "2",
  "auto": "4",
  "medium": "6",
  "high": "8",
  "turbo": "10"
};

const modeMapForApi = {
  "fan_only": "1",
  "cool": "2",
  "heat": "3",
  "auto": "4"
};

// Функции для обработки каждого типа capability
const handlersChangeParams = {
  "devices.capabilities.on_off": (capability, params) => {
    params.start = capability.state.value === true ? "1" : "0";
  },
  "devices.capabilities.range": (capability, params) => {
    const { instance, value } = capability.state;
    if (instance === "temperature") {
      params.tempTarget = String(value);
    } else if (instance === "humidity") {
      params.HumTarget = String(value);
      params.CO2Target = "700";
      params.activeFilter = "0";
    }
  },
  "devices.capabilities.mode": (capability, params) => {
    const { instance, value } = capability.state;
    if (instance === "fan_speed") {
      params.fanTarget = fanSpeedMapForApi[value] || value;
    } else if (instance === "thermostat") {
      params.res = modeMapForApi[value] || value;
    }
  }
};


// Функция для получения массива доступных режимов в зависимости от avalibleMode
function getAvailableModes(avalibleMode) {
  const modes = [];
  if (avalibleMode === 3) {
    // Вентиляция, нагрев, охлаждение, климат-контроль
    modes.push({ "value": "fan_only" }, { "value": "heat" }, { "value": "cool" }, { "value": "auto" });
  } else if (avalibleMode === 2) {
    // Вентиляция, нагрев
    modes.push({ "value": "fan_only" }, { "value": "heat" });
  } else if (avalibleMode === 1) {
    // Вентиляция, охлаждение
    modes.push({ "value": "fan_only" }, { "value": "cool" });
  }
  return modes;
}




app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});