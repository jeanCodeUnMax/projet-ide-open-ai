import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePdfImagesList, splitPdfPages } from '../electron/lib/rag-providers.mjs'

test('splitPdfPages conserve la pagination pdftotext', () => {
  assert.deepEqual(splitPdfPages('Page une\fPage deux\f'), [
    { number: 1, text: 'Page une' },
    { number: 2, text: 'Page deux' },
  ])
})

test('parsePdfImagesList associe les images à leurs pages', () => {
  const output = `page   num  type   width height color comp bpc enc interp object ID x-ppi y-ppi size ratio\n--------------------------------------------------------------------------------------------\n   1     0 image     640   480  rgb     3   8  jpeg   no       12  0   72    72 10K 2.0%\n   3     1 image     320   200  rgb     3   8  image  no       18  0   72    72 20K 3.0%\n`
  assert.deepEqual(parsePdfImagesList(output), [
    { page: 1, sequence: 1 },
    { page: 3, sequence: 2 },
  ])
})
