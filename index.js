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
        "capabilities": [
          {
            "type": "devices.capabilities.range",
            // температура
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
            "type": "devices.capabilities.range",
            // влажность
            "retrievable": true,
            "parameters": {
              "instance": "humidity",
              "random_access": true,
              "range": {
                "max": 100,
                "min": 0,
                "precision": 1
              },
              "unit": "unit.percent"
            }
          },
          {
            "type": "devices.capabilities.mode",
            // скорость
            "retrievable": true,
            "parameters": {
              "instance": "fan_speed",
              "modes": [
                {
                  "value": "auto"
                },
                {
                  "value": "high"
                },
                {
                  "value": "low"
                },
                {
                  "value": "medium"
                },
                {
                  "value": "quiet"
                },
                {
                  "value": "turbo"
                },
              ]
            }
          },
          {
            "type": "devices.capabilities.mode",
            // режимы
            "retrievable": true,
            "parameters": {
              "instance": "thermostat",
              "modes": availableModes
            }
          },
          {
            "type": "devices.capabilities.on_off",
            // вкл выкл
            "retrievable": false,
            "reportable": false,
            "parameters": {
              "split": false
            }
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
  userJwtYandex = req.headers.authorization;
  const requestId = req.headers["x-request-id"];

  try {
    // Извлекаем массив устройств из тела запроса
    const devicesArrayYandex = req.body.devices;
    // console.log("devicesArrayYandex", devicesArrayYandex);

    let devicesPayload = [];

    for (const device of devicesArrayYandex) {

      if (!userJwt) {
        console.error("JWT token is undefined.");
        return;
      }

      // Запрос на получение параметров устройства
      const getDevicesParamsResponse = await fetchDeviceParams(device.id, userJwt);


      // Проверяем наличие данных
      // if (getDevicesParamsResponse.data && getDevicesParamsResponse.data.data.length > 0) {
      const deviceData = getDevicesParamsResponse.data.data[0];
      console.log("deviceData", deviceData);

      let availableModes = getAvailableModes(deviceData.avalibleMode);
      console.log("availableModes", availableModes);

      let tempRoom = Math.floor(deviceData.tempRoom);
      let humRoom = Math.floor(deviceData.humRoom);
      let enabledData = deviceData.enabled == "1" ? true : false;
      let fanSpeedPData = deviceData.fanSpeedP;

      // Здесь формируется состояние устройства в соответствии с полученными данными
      devicesPayload.push({
        "id": String(device.id),
        "capabilities": [
          {
            "type": "devices.capabilities.on_off",
            "state": {
              "instance": "on",
              "value": true
            }
          },
          {
            "type": "devices.capabilities.range",
            // температура
            "state": {
              "instance": "temperature",
              "value": String(tempRoom)
            }
          },
          {
            "type": "devices.capabilities.range",
            // влажность
            "state": {
              "instance": "humidity",
              "value": String(humRoom)
            }
          },
          {
            "type": "devices.capabilities.mode",
            // скорость
            "state": {
              "instance": "fan_speed",
              "value": String(fanSpeedPData)
            } 
          },
          {
            "type": "devices.capabilities.mode",
            // режимы
            "state": {
              "instance": "thermostat",
              "value": availableModes
            } 
          },
        ],
        "properties": [
          {
            "type": "devices.properties.float",
            "state": {
              "instance": "humidity",
              "value": humRoom
            }
          }, {
            "type": "devices.properties.float",
            "state": {
              "instance": "temperature",
              "value": tempRoom
            }
          }
          // Другие properties...
        ]
      });
      // }
    }

    // Отправляем ответ
    res.json({
      "request_id": String(requestId),
      "payload": {
        "devices": devicesPayload
      }
    });
  } catch (error) {
    console.error("Error querying device statuses:", error);
    res.status(500).send({ error: "Error querying device statuses" });
  }
});


let fan_speed_value = "";

// Изменение состояния у устройств
app.post("/v1.0/user/devices/action", async (req, res) => {
  try {
    const actions = req.body.payload.devices; // Получаем массив действий от яндекса
    let results = [];

    console.log("actions", actions[0].capabilities);


    for (const action of actions) {
      const deviceId = action.id;
      const capabilities = action.capabilities; // Получаем массив действий для каждого устройства

      console.log("capabilitiesYANDEX", capabilities);
      console.log("deviceIdYANDEX", deviceId);

      for (const capability of capabilities) {
        const params = {
          controllerId: String(deviceId),
          // другие параметры
        };

        // В зависимости от типа capability, выполняем соответствующее действие
        switch (capability.type) {
        case "devices.capabilities.on_off":
          // Выполнение действия включения/выключения
          params.start = capability.state.value === true ? "1" : "0";
          break;

        case "devices.capabilities.range":
          // Обработка разных типов range
          switch (capability.state.instance) {
          case "temperature":
            params.tempTarget = String(capability.state.value);
            break;
          case "humidity":
            params.HumTarget = String(capability.state.value);
            break;
          }
          break;

        case "devices.capabilities.mode":
          // Обработка разных типов mode
          switch (capability.state.instance) {
          case "fan_speed":


            if (capability.state.value === "auto") {
              fan_speed_value = "4";
            }

            params.fanTarget = fan_speed_value;
            break;
          case "thermostat":
            params.res = String(capability.state.value);
            break;
          }
          break;
        }

        await fetchDeviceChangeParams(params, userJwt); // Вызов функции изменения параметров
      }

      results.push({
        id: deviceId,
        capabilities: [
          {
            "type": "devices.capabilities.on_off",
            "state": {
              "instance": "on",
              "action_result": {
                "status": "DONE"
              }
            }
          },
        ]
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
      "Authorization": `Bearer ${userJwt}`
    }
  });
}

// Функция для запроса параметров устройства
async function fetchDeviceParams(controllerId, userJwt) {

  return await axios.post("https://smart.horynize.ru/api/vent-units/getparams", {
    "controllerId": String(controllerId),
  }, {
    headers: {
      "Authorization": `Bearer ${userJwt}`
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
        // "Content-Type": "application/json"
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