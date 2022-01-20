export const getLoaderHeight = async (viewport, tick) => {
  const previousTop = getFirstRowTop(viewport)
  await tick()
  const currentTop = getFirstRowTop(viewport)

  return previousTop - currentTop < 0 ? 0 : previousTop - currentTop
}

function getFirstRowTop(viewport) {
  const element = viewport.querySelector('virtual-infinite-list-row')
  return element?.getBoundingClientRect().top ?? 0
}

export function getFirstItemMarginTop(viewport) {
  const slotTemplate = viewport.querySelector('virtual-infinite-list-row').firstElementChild
  if (!slotTemplate) return 0
  const marginTop = getMarginTop(slotTemplate)
  if (marginTop > 0) return marginTop
  const slotItemTemplate = slotTemplate.firstElementChild
  if (!slotItemTemplate) return 0
  return getMarginTop(slotItemTemplate)
}
function getMarginTop(element) {
  const style = getComputedStyle(element)
  const marginTop = +style.marginTop.replace('px', '')
  return marginTop
}
