require("dotenv").config();
const express = require("express");
const app = express();
const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");


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

module.exports = router;