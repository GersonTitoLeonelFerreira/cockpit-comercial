;(function initYolenManyChatMainWorldReportExport(root) {
  'use strict'

  const PROBE_BUTTON_ID = 'yolen-manychat-mainworld-identity-probe'
  const FINAL_STAGE = 'returned_to_baseline_evaluated'
  const FILE_NAME = 'yolen-manychat-mainworld-identity-report.json'

  function parseReport(value) {
    if (typeof value !== 'string' || !value.trim()) return null

    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : null
    } catch {
      return null
    }
  }

  function downloadReport(report, documentRef = root.document) {
    if (!documentRef?.body) return false

    const payload = `${JSON.stringify(report, null, 2)}\n`
    const href = `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`
    const anchor = documentRef.createElement('a')

    anchor.href = href
    anchor.download = FILE_NAME
    anchor.style.display = 'none'

    documentRef.body.appendChild(anchor)

    try {
      anchor.click()
      return true
    } catch {
      return false
    } finally {
      anchor.remove()
    }
  }

  function installReportExport(documentRef = root.document) {
    if (!documentRef || typeof documentRef.addEventListener !== 'function') {
      return false
    }

    if (root.__YOLEN_MANYCHAT_MAINWORLD_REPORT_EXPORT_INSTALLED__) {
      return true
    }

    documentRef.addEventListener(
      'click',
      (event) => {
        if (event?.isTrusted !== true) return

        const button = event.target?.closest?.(`#${PROBE_BUTTON_ID}`)
        if (!button) return

        const report = parseReport(
          button.dataset?.yolenMainworldIdentityProbeResult,
        )

        if (!report || report.stage !== FINAL_STAGE) return
        if (button.dataset?.yolenMainworldReportExported === 'true') return

        const downloaded = downloadReport(report, documentRef)
        button.dataset.yolenMainworldReportExported = downloaded
          ? 'true'
          : 'false'

        if (downloaded) {
          button.textContent = report.pass === true
            ? 'Yolen · identidade interna PASS · relatório baixado'
            : 'Yolen · identidade interna não provada · relatório baixado'
        }
      },
      false,
    )

    root.__YOLEN_MANYCHAT_MAINWORLD_REPORT_EXPORT_INSTALLED__ = true
    return true
  }

  const api = Object.freeze({
    PROBE_BUTTON_ID,
    FINAL_STAGE,
    FILE_NAME,
    parseReport,
    downloadReport,
    installReportExport,
  })

  root.YolenManyChatMainWorldReportExport = api
  installReportExport()

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
