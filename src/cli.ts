import fs from 'fs'
import path from 'path'
import { import_ } from '@brillout/import'

eject()

type EjectConfig = {
  ejectables: {
    src: string
    importModifications: {
      importPathOld: string
      importPathNew: string
    }[]
  }[]
}

async function eject() {
//require('@brillout/stem-react')
await import_('@brillout/stem-react')

  const cwd = process.cwd()

  const pkgPath = `${cwd}/package.json`
  let pkg: { dependencies: Record<string, string> }
  try {
    pkg = require(pkgPath)
  } catch {
    throw new Error(`No package.json found at ${cwd}`)
  }
  const stemPackages = Object.keys(pkg.dependencies).filter((depName) => depName.split('/')[1]?.startsWith('stem-'))
  console.log(stemPackages)
  stemPackages.forEach((pkgName) => {
    let mod: Record<string, unknown>
    try {
      mod = require(`${pkgName}/eject.config.js`)
    } catch(err) {
      console.log(err)
      return
    }
    const ejectConfig: EjectConfig = mod.default as EjectConfig
    console.log(ejectConfig)
  })
}
