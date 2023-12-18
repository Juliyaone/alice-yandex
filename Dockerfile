# Указываем базовый образ
FROM node:14

# Устанавливаем рабочую директорию в контейнере
WORKDIR /usr/src/app

# Копируем package.json и package-lock.json (если есть)
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код приложения
COPY . /usr/src/app

# Открываем порт, который будет слушать приложение
EXPOSE 3000

# Запускаем приложение
CMD ["node", "index.js"]