const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
app.use(express.urlencoded({ extended: true }));
const axios = require('axios');

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Страница авторизации
app.get('/v1.0/login', (req, res) => {
 
  const { client_id, redirect_uri, state } = req.query;
  // Отображаем форму для ввода логина и пароля

  console.log(client_id, redirect_uri, state);
  res.send(`
    <form action="/v1.0/auth" method="post">

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
    const { username, password } = req.body;
    // Отправляем запрос на PHP-сервер для аутентификации
    const response = await axios.post('http://smart.horynize.ru/api/users/auth.php', {
      username,
      password
    });

    console.log('response', response);

    if (response.statusText === 'OK') {
      // Успешная аутентификация, перенаправляем пользователя

            res.send('Авторизация прошла успешно!');

      // const { client_id, redirect_uri, state } = req.query;
      // const redirectUrl = `${redirect_uri}?client_id=${client_id}&state=${state}&token=${response.data.token}`;
      // res.redirect(redirectUrl);
    } else {
      res.send('Ошибка аутентификации');
    }
  } catch (error) {
    console.log(error);
    res.send('Произошла ошибка');
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});