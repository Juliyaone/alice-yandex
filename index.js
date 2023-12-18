const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Страница авторизации
app.get('/v1.0/login', (req, res) => {
 
  const { client_id, redirect_uri, state } = req.query;
  // Отображаем форму для ввода логина и пароля

  console.log(client_id, redirect_uri, state);
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

app.post('/api/users/auth.php', async (req, res) => {
  try {
    const { username, password } = req.body;
    // Отправляем запрос на PHP-сервер для аутентификации
    const response = await axios.post('http://smart.horynize.ru/api/users/auth.php', {
      username,
      password
    });

    if (response.data.success) {
      // Успешная аутентификация, перенаправляем пользователя
      const { client_id, redirect_uri, state } = req.query;
      const redirectUrl = `${redirect_uri}?client_id=${client_id}&state=${state}&token=${response.data.token}`;
      res.redirect(redirectUrl);
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