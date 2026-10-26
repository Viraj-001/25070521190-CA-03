# Keepwise client

React interface packaged as a Mac desktop app with Electron. Start the API in `../server` first, then run:

```sh
npm install
npm run desktop
```

`npm run desktop` opens a Keepwise app window while running the Vite development server in the background. The app calls the Node API at `http://127.0.0.1:5000`.

To build a distributable Mac disk image after installing the dependencies:

```sh
npm run dist:mac
```

The `.dmg` will be created inside `client/release/`. The API and MongoDB must still be running when you use the desktop app.
