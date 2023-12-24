const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const secretKeyForToken = process.env.SECRET_KEY_FOR_TOKEN;
const clientSecret = process.env.CLIENT_SECRET;
const clientId = process.env.CLIENT_ID;

router.post('/v1.0/refresh_token', async (req, res) => {

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


module.exports = router;