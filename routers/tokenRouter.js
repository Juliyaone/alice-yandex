const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const secretKeyForToken = process.env.SECRET_KEY_FOR_TOKEN;
const clientSecret = process.env.CLIENT_SECRET;
const clientId = process.env.CLIENT_ID;

const authorizationCodes = {};


router.post("/v1.0/token", async (req, res) => {
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


module.exports = router;