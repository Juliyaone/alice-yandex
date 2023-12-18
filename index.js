const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Страница авторизации
app.get('/v1.0/login', (req, res) => {
 
  // const { client_id, redirect_uri, state } = req.query;
  // Отображаем форму для ввода логина и пароля
  res.send(`
    <form action="./api/users/auth.php" method="post">

      <label for="username">Логин:</label>
      <input type="text" id="username" name="username"><br>
      <label for="password">Пароль:</label>
      <input type="password" id="password" name="password"><br>
      <input type="submit" value="Войти">
    </form>
  `);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});