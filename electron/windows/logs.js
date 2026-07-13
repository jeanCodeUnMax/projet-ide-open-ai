const output = document.querySelector('#logs')
async function refresh() {
  output.textContent = (await window.desktopAPI.runtime.logs()) || 'Aucun journal pour cette session.'
  window.scrollTo(0, document.body.scrollHeight)
}
document.querySelector('#refresh').addEventListener('click', refresh)
document.querySelector('#restart').addEventListener('click', async () => {
  await window.desktopAPI.runtime.restart()
  await refresh()
})
await refresh()
