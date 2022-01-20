import { derived, writable } from 'svelte/store'
import { Direction, Type } from './constant'

const store = writable({ items: [] })

export const elements = derived(store, (state) => state.items)

let previous = []
export const changes = derived(store, (state, set) => {
  set([state.items, previous])
  previous = state.items
})

export const type = derived(changes, (state) => {
  const [newer, older] = state

  if (!!newer && newer.length === 0 && older.length === 0) return Type.init
  if (!!newer && !!older && newer.length - older.length > 0) return Type.add
  if (!!newer && !!older && newer.length === older.length) return Type.modify
  if (!!newer && !!older && newer.length - older.length < 0) return Type.remove
})

export const load = (items, direction) =>
  store.update((state) => {
    switch (direction) {
      case Direction.top: {
        return { ...state, items: [...items] }
      }
      case Direction.bottom: {
        return { ...state, items: [...items] }
      }
    }
  })

export const reset = () => {
  previous = []
}
