// Compile the immutable owner schemas locally. No network or provider runtime code.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validators = ['provider', 'catalog'].map(name => ajv.compile(JSON.parse(readFileSync(new URL(name + '.schema.json', import.meta.url), 'utf8'))))

export function validateInstalledNotesMetadata(provider, catalog) {
  for (const [index, value] of [provider, catalog].entries()) {
    const validate = validators[index]
    if (!validate(value)) throw new Error('Release Notes ' + ['provider', 'catalog'][index] + ' violates Spaces v1 schema: ' + ajv.errorsText(validate.errors))
  }
}
