import path from 'path'
import { import_ } from '@brillout/import'
import { assert, assertUsage, toPosixPath } from './utils'
import { projectInfo } from './utils/projectInfo'

main()

type Action =
  | {
      moveSourceCode: string
    }
  | {
      modifyImportPaths: {
        importPathOld: string
        importPathNew: string
      }
    }

type EjectConfig = {
  ejectables: {
    name?: string
    actions: Action[]
  }[]
}

type Ejectable = {
  stemPackageName: string
  stemPackageRootDir: string
  ejectName: string | null
  actions: Action[]
}

async function main() {
  const ejectables = await findEjectables()

  const { stemPackageName, ejectName } = getCliArgs()
  if (!stemPackageName) {
    showHelp(ejectables)
    return
  }

  const ejectable = findMatch(ejectables, stemPackageName, ejectName)
  if (!ejectable) {
    showHelp(ejectables)
    return
  }

  eject(ejectable)
}

function eject(ejectable: Ejectable) {
  ejectable.actions.forEach((action) => {
    console.log(action)
  })
}

function findMatch(ejectables: Ejectable[], stemPackageName: string, ejectName: string | null): null | Ejectable {
  const matches = ejectables.filter(
    (ejectable) => ejectable.stemPackageName === stemPackageName && ejectable.ejectName === ejectName
  )
  assert(matches.length <= 1)
  return matches[0] ?? null
}

function showHelp(ejectables: Ejectable[]) {
  const { projectName, projectVersion } = projectInfo
  console.log(`${projectName}@${projectVersion}`)
  console.log('')
  console.log('Usage:')
  ejectables.forEach((ejectable) => {
    const { stemPackageName, ejectName } = ejectable
    let cmd = `  $ npx eject ${stemPackageName}`
    if (ejectName) {
      cmd += ` ${ejectName}`
    }
    console.log(cmd)
  })
  console.log('')
  console.log('(Or `$ pnpm execute eject` and `$ yarn eject` instead of `$ npx eject`)')
}

function getCliArgs(): { stemPackageName: null | string; ejectName: null | string } {
  const args = process.argv.slice(2)
  const stemPackageName = args[0] ?? null
  const ejectName = args[1] ?? null
  return { stemPackageName, ejectName }
}

async function findEjectables(): Promise<Ejectable[]> {
  const pkgJson = getUserPackageJson()
  const stemPackages = getStemPackages(pkgJson)
  const ejectables = (await Promise.all(stemPackages.map(getEjectablesFromConfig))).flat()
  return ejectables
}

async function getEjectablesFromConfig(stemPackageName: string): Promise<Ejectable[]> {
  assert(stemPackageName.startsWith('@') && stemPackageName.includes('stem-'))

  if (stemPackageName === '@brillout/stem-react') {
    const ejectConfig = (await import_('/home/romuuu/code/stem-react/dist/eject.config.js')).default as EjectConfig
    const { ejectables } = ejectConfig
    assert(ejectables.length === 1)
    const { actions } = ejectables[0]
    assert(actions.length > 1)
    return [
      {
        stemPackageName,
        stemPackageRootDir: '/home/romuuu/code/stem-react',
        ejectName: null,
        actions
      }
    ]
  }

  const ejectConfigPath = `${stemPackageName}/eject.config.js`
  let mod: Record<string, unknown>
  try {
    mod = await import_(ejectConfigPath)
  } catch (err) {
    if ((err as any).code === 'ERR_MODULE_NOT_FOUND') {
      assertUsage(false, `Couldn't find ${ejectConfigPath}`)
    }
    throw err
  }
  const stemPackageRootDir = await getStemPackageRootDir(stemPackageName)
  const ejectConfig: EjectConfig = mod.default as EjectConfig
  console.log(ejectConfig)
  return ejectConfig.ejectables.map(({ actions, name }) => ({
    stemPackageName,
    stemPackageRootDir,
    actions,
    ejectName: name ?? null
  }))
}

async function getStemPackageRootDir(stemPackageName: string): Promise<string> {
  const pkgJsonPath = `${stemPackageName}/package.json`
  let pathResolved: string
  try {
    pathResolved = await import_(pkgJsonPath)
  } catch {
    assertUsage(false, `Make sure to (properly) set \`${pkgJsonPath}#exports['package.json']\``)
  }
  const stemPackageRootDir = path.posix.dirname(toPosixPath(pathResolved))
  return stemPackageRootDir
}

function getStemPackages(pkgJson: UserPackageJson) {
  const stemPackages = Object.keys(pkgJson?.dependencies ?? {}).filter((depName) =>
    depName.split('/')[1]?.startsWith('stem-')
  )
  return stemPackages
}

type UserPackageJson = { dependencies?: Record<string, string> }

function getUserPackageJson(): UserPackageJson {
  const cwd = process.cwd()

  const pkgPath = `${cwd}/package.json`
  let pkgJson: UserPackageJson
  try {
    pkgJson = require(pkgPath)
  } catch {
    throw new Error(`No package.json found at ${cwd}`)
  }
  return pkgJson
}
