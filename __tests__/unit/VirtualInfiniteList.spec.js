import VirtualInfiniteList from '../../src'
import '@testing-library/jest-dom/extend-expect'
import { render } from '@testing-library/svelte'

describe('VirtualInfiniteList.svelte', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('empty text appeared if items = []', () => {
    const { container, unmount } = render(VirtualInfiniteList, {
      items: [],
      loading: false,
      direction: 'top',
      maxItemCountPerLoad: 30,
    })

    expect(container.querySelector('virtual-infinite-list-contents').innerHTML.trim()).toEqual(
      'Empty!!!'
    )

    unmount()
  })

  it('loading text appreared if loading is true and direction is top', () => {
    const { container, unmount } = render(VirtualInfiniteList, {
      items: [],
      loading: true,
      direction: 'top',
      maxItemCountPerLoad: 30,
    })

    expect(container.querySelector('virtual-infinite-list-contents').innerHTML.trim()).toEqual(
      'Loading...'
    )

    unmount()
  })

  it('loading text appreared if loading is true and direction is bottom', () => {
    const { container, unmount } = render(VirtualInfiniteList, {
      items: [],
      loading: true,
      direction: 'bottom',
      maxItemCountPerLoad: 30,
    })

    expect(container.querySelector('virtual-infinite-list-contents').innerHTML.trim()).toEqual(
      'Loading...'
    )

    unmount()
  })
})
