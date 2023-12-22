const path = require('path')
const fs = require('fs/promises')

const settingsPath = path.join(__dirname, 'settings.json')
let isBackingUpEnabled = false

async function main() {
  if (process.argv[2] === '--no-gui') {
    await backUp()
  } else {
    const { app, BrowserWindow, ipcMain, dialog } = require('electron')
    const AutoLaunch = require('auto-launch')

    async function pickPathToBackUp() {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      })
      if (canceled) {
        return null
      } else {
        const pathToBackUp = filePaths[0]

        const settings = await loadSettings()

        settings.pathToBackUp = pathToBackUp

        await saveSettings(settings)

        return pathToBackUp
      }
    }

    async function pickPathToBackUpTo() {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      })
      if (canceled) {
        return null
      } else {
        const pathToBackUpTo = filePaths[0]

        const settings = await loadSettings()

        settings.pathToBackUpTo = pathToBackUpTo

        await saveSettings(settings)

        return pathToBackUpTo
      }
    }

    // Handle creating/removing shortcuts on Windows when installing/uninstalling.
    if (require('electron-squirrel-startup')) {
      app.quit()
    }

    const createWindow = () => {
      // Create the browser window.
      const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
        },
      })
      mainWindow.menuBarVisible = false

      // and load the index.html of the app.
      mainWindow.loadFile(path.join(__dirname, 'index.html'))

      // Open the DevTools.
      // mainWindow.webContents.openDevTools()
    }

    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    app.on('ready', async function () {
      const autoLaunch = new AutoLaunch({
        name: 'Backup',
        path: app.getPath('exe'),
      })
      const isAutoLaunchEnabled = await autoLaunch.isEnabled()
      if (!isAutoLaunchEnabled) {
        autoLaunch.enable()
      }

      ipcMain.handle('pickPathToBackUp', pickPathToBackUp)
      ipcMain.handle('pickPathToBackUpTo', pickPathToBackUpTo)
      ipcMain.on('startBackingUp', function () {
        backUp()
      })
      ipcMain.on('stopBackingUp', function () {
        isBackingUpEnabled = false
      })
      ipcMain.handle('requestSettings', async function () {
        return await loadSettings()
      })
      createWindow()
    })

    // Quit when all windows are closed, except on macOS. There, it's common
    // for applications and their menu bar to stay active until the user quits
    // explicitly with Cmd + Q.
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })

    app.on('activate', () => {
      // On OS X it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })

    // In this file you can include the rest of your app's specific main process
    // code. You can also put them in separate files and import them here.
  }
}

async function backUp() {
  if (isBackingUpEnabled) {
    return
  }

  isBackingUpEnabled = true

  const { simpleGit } = require('simple-git')

  const settings = await loadSettings()

  const pathToBackUp = settings.pathToBackUp
  const pathToBackUpTo = settings.pathToBackUpTo

  const git = simpleGit(pathToBackUpTo)
    .env('GIT_WORK_TREE', pathToBackUp)
    .env('GIT_DIR', pathToBackUpTo)
  if (!(await doesFileExist(path.join(pathToBackUpTo, 'objects')))) {
    await git.init()
    await git.add('.')
    await commit()
  }

  for await (const event of fs.watch(pathToBackUp, { recursive: true })) {
    if (!isBackingUpEnabled) {
      return
    }

    const eventType = event.eventType
    const filePath = event.filename
    console.log(eventType, filePath)
    if (filePath && eventType === 'change') {
      const sourcePath = path.join(pathToBackUp, filePath)
      try {
        let stats
        try {
          stats = await fs.stat(sourcePath)
        } catch (error) {
          if (error.code === 'ENOENT') {
            await removeFileFromBackUp(sourcePath)
            continue
          } else {
            throw error
          }
        }
        if (stats.isFile()) {
          await git.add(sourcePath)
          await commit()
        }
      } catch (error) {
        console.error(error)
      }
    }
  }

  async function removeFileFromBackUp(filePath) {
    try {
      await git.add(filePath)
    } catch (error) {
      return
    }
    await commit()
  }

  async function commit() {
    await git.commit('', { '--allow-empty-message': true })
  }

  async function doesFileExist(filePath) {
    try {
      await fs.access(filePath, fs.constants.F_OK)
      return true
    } catch (error) {
      return false
    }
  }
}

async function loadSettings() {
  let settings
  try {
    const settingsRaw = await fs.readFile(settingsPath, 'utf8')
    settings = JSON.parse(settingsRaw)
  } catch (error) {
    if (error.code === 'ENOENT') {
      settings = {}
    } else {
      throw error
    }
  }
  return settings
}

async function saveSettings(settings) {
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2))
}

main().catch(console.error)
