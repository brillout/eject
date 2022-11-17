import path from 'path'
import { assert, isScriptFile, runCommand, toPosixPath } from './utils'
import { projectInfo } from './utils/projectInfo'
import fse from 'fs-extra'
import fs from 'fs'
import { getStemPackages, type StemPackage } from './stemUtils'

const userRootDir = process.cwd()

main()

// Regexes has false-positives which is alright.
// Adapter from: https://stackoverflow.com/questions/52086611/regex-for-matching-js-import-statements/69867053#69867053
// Convert RegExp literal to RegExp constructor: https://regex101.com/ > "Code Generator"
// const importRE = (importPath: string) => /import([ \n\t]*(?:[^ \n\t\{\}]+[ \n\t]*,?)?(?:[ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\})?[ \n\t]*)from([ \n\t]*)(['"])([^'"\n]+)(['"])/g
const getImportRE = (importPath: string) =>
  new RegExp(
    `import([ \\n\\t]*(?:[^ \\n\\t\\{\\}]+[ \\n\\t]*,?)?(?:[ \\n\\t]*\\{(?:[ \\n\\t]*[^ \\n\\t"\'\\{\\}]+[ \\n\\t]*,?)+\\})?[ \\n\\t]*)from([ \\n\\t]*)([\'"])${importPath}([\'"])`,
    'gm'
  )

type Action = ActionMoveSourceCode | ActionModifyImportPaths
type ActionModifyImportPaths = {
  modifyImportPaths: {
    importPathOld: string
    importPathNew: string
  }
}
type ActionMoveSourceCode = {
  moveSourceCode: string
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
  const stemPackages = await getStemPackages(userRootDir)
  const ejectables = await findEjectables(stemPackages)

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

  await eject(ejectable)
}

async function eject(ejectable: Ejectable) {
  for (const action of ejectable.actions) {
    await applyAction(action, ejectable)
  }
  removeStemPackage(ejectable.stemPackageName)
}

async function applyAction(action: Action, ejectable: Ejectable) {
  if ('moveSourceCode' in action) {
    moveSourceCode(action, ejectable)
  }
  if ('modifyImportPaths' in action) {
    await modifyImportPaths(action)
  }
}

function moveSourceCode(action: ActionMoveSourceCode, ejectable: Ejectable) {
  const dirSource = path.join(ejectable.stemPackageRootDir, action.moveSourceCode)
  const dirTarget = path.join(process.cwd(), action.moveSourceCode)
  fse.copySync(dirSource, dirTarget, { overwrite: false })
}
async function modifyImportPaths(action: ActionModifyImportPaths) {
  const cwd = process.cwd()
  const { importPathOld, importPathNew } = action.modifyImportPaths
  const importRE = getImportRE(importPathOld)
  const files = await getUserFiles()
  files.forEach((filePath) => {
    if (!isScriptFile(filePath)) {
      return
    }
    const fileContentOld = String(fs.readFileSync(filePath))
    assert(filePath.startsWith(cwd), { filePath, cwd })
    const importPath = path.posix.relative(path.posix.dirname(filePath), path.posix.join(cwd, importPathNew))
    let fileContentNew = fileContentOld.replace(importRE, `import$1from$2$3${importPath}$4`)
    if (fileContentNew !== fileContentOld) {
      fs.writeFileSync(filePath, fileContentNew)
    }
  })
}

async function getUserFiles(): Promise<string[]> {
  const cwd = process.cwd()
  const stdout = await runCommand('git ls-files', { cwd })
  const files = stdout.split('\n').map((filePathRelative) => toPosixPath(path.join(cwd, filePathRelative)))
  return files
}

function removeStemPackage(stemPackageName: string) {
  const pkgJsonPath = path.join(userRootDir, './package.json')
  const pkgJson = require(pkgJsonPath)
  assert(Object.keys(pkgJson.dependencies!).includes(stemPackageName))
  let fileContent = String(fs.readFileSync(pkgJsonPath))
  // Hacky but needed if we want to perserve formating
  fileContent = fileContent
    .split('\n')
    .filter((line) => !line.includes(`"${stemPackageName}": "`))
    .join('\n')
  fs.writeFileSync(pkgJsonPath, fileContent)
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

async function findEjectables(stemPackages: StemPackage[]): Promise<Ejectable[]> {
  const ejectables = (await Promise.all(stemPackages.map(getEjectablesFromConfig))).flat()
  return ejectables
}

async function getEjectablesFromConfig(stemPackage: StemPackage): Promise<Ejectable[]> {
  const { stemPackageName, stemPackageRootDir, loadModule } = stemPackage
  const moduleExports = await loadModule('eject.config.js')
  // TODO: assert `ejectConfig`
  const ejectConfig: EjectConfig = moduleExports.default as EjectConfig
  return ejectConfig.ejectables.map(({ actions, name }) => ({
    stemPackageName,
    stemPackageRootDir,
    actions,
    ejectName: name ?? null
  }))
}
