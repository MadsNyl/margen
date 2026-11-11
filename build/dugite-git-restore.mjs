// electron-builder afterAllArtifactBuild hook: puts the machine's own git back (see dugite-git.mjs).
import { arch } from 'node:os'
import { downloadGit } from './dugite-git.mjs'

export default async function hostGit() {
  downloadGit(arch())
  return []
}
