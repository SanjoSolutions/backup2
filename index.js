import fs from 'fs/promises'
import path from 'path'
import { simpleGit } from 'simple-git'
import readline from 'readline/promises'
import { fileURLToPath } from 'url'

const pathToBackUpTo = path.resolve(path.normalize(process.argv[2]))
const pathToBackUp = path.resolve(path.normalize(process.argv[3]))

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let options
try {
  const optionsRaw = await fs.readFile(
    path.join(__dirname, 'options.json'),
    'utf8'
  )
  options = JSON.parse(optionsRaw)
} catch (error) {
  if (error.code === 'ENOENT') {
    options = {}
  } else {
    throw error
  }
}

if (
  pathToBackUpTo !== options.pathToBackUpTo &&
  (await doesFileExist(pathToBackUpTo))
) {
  console.warn(`Path to back up to already exists ("${pathToBackUpTo}").`)
  const rl = readline.createInterface(process.stdin, process.stdout)
  const answer = await rl.question('Still back up to it? (y/n) ')
  if (answer === 'y') {
    options.pathToBackUpTo = pathToBackUpTo
    await fs.writeFile(
      path.join(__dirname, 'options.json'),
      JSON.stringify(options, null, 2)
    )
  } else {
    process.exit(1)
  }
}

const git = simpleGit(pathToBackUpTo)
if (!(await doesFileExist(path.join(pathToBackUpTo, '.git')))) {
  await git.init()
}

for await (const event of fs.watch(pathToBackUp, { recursive: true })) {
  const eventType = event.eventType
  const filePath = event.filename
  console.log(eventType, filePath)
  if (filePath && eventType === 'change') {
    const sourcePath = path.join(pathToBackUp, filePath)
    const destinationPath = path.join(
      pathToBackUpTo,
      sourcePath[0],
      sourcePath.substring(3)
    )
    try {
      let stats
      try {
        stats = await fs.stat(sourcePath)
      } catch (error) {
        if (error.code === 'ENOENT') {
          await removeFileFromBackUp(destinationPath)
          continue
        } else {
          throw error
        }
      }
      if (stats.isFile()) {
        await fs.mkdir(path.dirname(destinationPath), { recursive: true })
        try {
          await fs.copyFile(sourcePath, destinationPath)
        } catch (error) {
          if (error.code === 'EBUSY') {
            continue
          } else if (error.code === 'ENOENT') {
            await removeFileFromBackUp(destinationPath)
            continue
          } else {
            throw error
          }
        }
        await git.add(destinationPath)
        await commit()
      }
    } catch (error) {
      console.error(error)
    }
  }
}

async function removeFileFromBackUp(filePath) {
  try {
    await git.rm(filePath)
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
