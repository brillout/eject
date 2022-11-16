import path from 'path'
import { import_ } from '@brillout/import'
import { assert, assertUsage, toPosixPath } from './utils'

eject()

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

async function eject() {
  //require('@brillout/stem-react')
  //await import_('@brillout/stem-react')

  const ejectables = await findEjectables()
  console.log(ejectables)
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
