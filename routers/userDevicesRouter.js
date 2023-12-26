const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();

let userId = '';


const capabilities = [];

// Пример добавления умения on_off
capabilities.push({
    "type": "devices.capabilities.on_off",
    "retrievable": true,
    "reportable": true,
    "parameters": {
        // здесь могут быть дополнительные параметры, если они требуются
    }
});

// Пример добавления умения mode
capabilities.push({
    "type": "devices.capabilities.mode",
    "retrievable": true,
    "reportable": true,
    "parameters": {
        // Параметры для режима работы, например, для кондиционера
    }
});

// Пример добавления умения range
capabilities.push({
    "type": "devices.capabilities.range",
    "retrievable": true,
    "reportable": true,
    "parameters": {
        "instance": "brightness",
        "unit": "unit.percent",
        "range": {
            "min": 0,
            "max": 100,
            "precision": 1
        }
    }
});

// Пример добавления умения toggle
capabilities.push({
    "type": "devices.capabilities.toggle",
    "retrievable": true,
    "reportable": true,
    "parameters": {
        // Параметры для переключателя, если они требуются
    }
});


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

// Информация об устройствах пользователя
router.get('/v1.0/user/devices', async (req, res) => {
  try {
    // Здесь нужно получить userID и JWT токен из запроса, предполагается, что они передаются в заголовках
    const userJwtYandex = req.headers['authorization'];
    const requestId = req.headers['x-request-id'];

    // Делаем запрос на ваш внутренний API для получения списка устройств
    const responseUserDevices = await axios.post('https://smart.horynize.ru/api/vent-units/all', {
      "userId": String(userId),
      "status": '1'
    }, {
      headers: {
        'Authorization': userJwtYandex
      }
    });

//     {
//     "0": {
//         "id_user": "23"
//     },
//     "vent-units": [
//         {
//             "id_controller": 20,
//             "name": ""
//         }
//     ]
// }

    // Форматируем ответ согласно требованиям Яндекса
    const formattedDevices = responseUserDevices.data["vent-units"].map(device => {
      return {
        id: device.id_controller, // Пример, нужно заменить на реальные поля из вашего API
        name: 'Название вентиляционной установки',
        description: 'Вентиляционная установка',
        room: 'device.room',
        type: 'thermostat.ac', // Тип устройства, должен соответствовать поддерживаемым типам Яндекса
        // custom_data: device.custom_data, // Это поле должно быть в вашем API, если оно есть
        capabilities: [], // Тут должен быть массив возможностей устройства
        properties: device.properties, // Тут должен быть массив свойств устройства
        device_info: { // Дополнительная информация об устройстве
          manufacturer: device.manufacturer,
          model: device.model,
          hw_version: device.hw_version,
          sw_version: device.sw_version
        }
      };
    });

    // Отправляем ответ
    res.json({
      request_id: requestId,
      payload: {
        user_id: userId, // userID должен быть получен из вашей системы аутентификации
        devices: formattedDevices
      }
    });

  } catch (error) {
    // Логируем ошибку для дальнейшего анализа
    console.error('Error fetching devices:', error);

    // Отправляем ошибку в ответе
    res.status(500).json({
      request_id: req.headers['x-request-id'], // Возвращаем тот же request_id что и получили
      error_code: "INTERNAL_ERROR",
      error_message: "Internal server error"
    });
  }
});


router.post('/v1.0/user/devices/query', async (req, res) => {
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
app.post('/v1.0/user/devices/action', async (req, res) => {
  try {
    // Здесь должна быть ваша логика для изменения состояния устройства
    console.log('Device action requested', req.body);
    // Выполните действие на основе тела запроса req.body
    res.status(200).send({ message: 'Device action executed successfully' });
  } catch (error) {
    console.error('Error performing action on device:', error);
    res.status(500).send({ error: 'Error performing action on device' });
  }
});

module.exports = router;