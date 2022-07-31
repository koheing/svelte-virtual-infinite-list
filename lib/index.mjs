function noop() { }
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
}
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}
function subscribe(store, ...callbacks) {
    if (store == null) {
        return noop;
    }
    const unsub = store.subscribe(...callbacks);
    return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}
function component_subscribe(component, store, callback) {
    component.$$.on_destroy.push(subscribe(store, callback));
}
function create_slot(definition, ctx, $$scope, fn) {
    if (definition) {
        const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
        return definition[0](slot_ctx);
    }
}
function get_slot_context(definition, ctx, $$scope, fn) {
    return definition[1] && fn
        ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
        : $$scope.ctx;
}
function get_slot_changes(definition, $$scope, dirty, fn) {
    if (definition[2] && fn) {
        const lets = definition[2](fn(dirty));
        if ($$scope.dirty === undefined) {
            return lets;
        }
        if (typeof lets === 'object') {
            const merged = [];
            const len = Math.max($$scope.dirty.length, lets.length);
            for (let i = 0; i < len; i += 1) {
                merged[i] = $$scope.dirty[i] | lets[i];
            }
            return merged;
        }
        return $$scope.dirty | lets;
    }
    return $$scope.dirty;
}
function update_slot_base(slot, slot_definition, ctx, $$scope, slot_changes, get_slot_context_fn) {
    if (slot_changes) {
        const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
        slot.p(slot_context, slot_changes);
    }
}
function get_all_dirty_from_scope($$scope) {
    if ($$scope.ctx.length > 32) {
        const dirty = [];
        const length = $$scope.ctx.length / 32;
        for (let i = 0; i < length; i++) {
            dirty[i] = -1;
        }
        return dirty;
    }
    return -1;
}
function append(target, node) {
    target.appendChild(node);
}
function append_styles(target, style_sheet_id, styles) {
    const append_styles_to = get_root_for_style(target);
    if (!append_styles_to.getElementById(style_sheet_id)) {
        const style = element('style');
        style.id = style_sheet_id;
        style.textContent = styles;
        append_stylesheet(append_styles_to, style);
    }
}
function get_root_for_style(node) {
    if (!node)
        return document;
    const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
    if (root && root.host) {
        return root;
    }
    return node.ownerDocument;
}
function append_stylesheet(node, style) {
    append(node.head || node, style);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function set_custom_element_data(node, prop, value) {
    if (prop in node) {
        node[prop] = typeof node[prop] === 'boolean' && value === '' ? true : value;
    }
    else {
        attr(node, prop, value);
    }
}
function children(element) {
    return Array.from(element.childNodes);
}
function set_style(node, key, value, important) {
    if (value === null) {
        node.style.removeProperty(key);
    }
    else {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
}
// unfortunately this can't be a constant as that wouldn't be tree-shakeable
// so we cache the result instead
let crossorigin;
function is_crossorigin() {
    if (crossorigin === undefined) {
        crossorigin = false;
        try {
            if (typeof window !== 'undefined' && window.parent) {
                void window.parent.document;
            }
        }
        catch (error) {
            crossorigin = true;
        }
    }
    return crossorigin;
}
function add_resize_listener(node, fn) {
    const computed_style = getComputedStyle(node);
    if (computed_style.position === 'static') {
        node.style.position = 'relative';
    }
    const iframe = element('iframe');
    iframe.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; ' +
        'overflow: hidden; border: 0; opacity: 0; pointer-events: none; z-index: -1;');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    const crossorigin = is_crossorigin();
    let unsubscribe;
    if (crossorigin) {
        iframe.src = "data:text/html,<script>onresize=function(){parent.postMessage(0,'*')}</script>";
        unsubscribe = listen(window, 'message', (event) => {
            if (event.source === iframe.contentWindow)
                fn();
        });
    }
    else {
        iframe.src = 'about:blank';
        iframe.onload = () => {
            unsubscribe = listen(iframe.contentWindow, 'resize', fn);
        };
    }
    append(node, iframe);
    return () => {
        if (crossorigin) {
            unsubscribe();
        }
        else if (unsubscribe && iframe.contentWindow) {
            unsubscribe();
        }
        detach(iframe);
    };
}
function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, bubbles, cancelable, detail);
    return e;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error('Function called outside component initialization');
    return current_component;
}
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}
function onDestroy(fn) {
    get_current_component().$$.on_destroy.push(fn);
}
function createEventDispatcher() {
    const component = get_current_component();
    return (type, detail, { cancelable = false } = {}) => {
        const callbacks = component.$$.callbacks[type];
        if (callbacks) {
            // TODO are there situations where events could be dispatched
            // in a server (non-DOM) environment?
            const event = custom_event(type, detail, { cancelable });
            callbacks.slice().forEach(fn => {
                fn.call(component, event);
            });
            return !event.defaultPrevented;
        }
        return true;
    };
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function tick() {
    schedule_update();
    return resolved_promise;
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        while (flushidx < dirty_components.length) {
            const component = dirty_components[flushidx];
            flushidx++;
            set_current_component(component);
            update(component.$$);
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
const outroing = new Set();
let outros;
function group_outros() {
    outros = {
        r: 0,
        c: [],
        p: outros // parent group
    };
}
function check_outros() {
    if (!outros.r) {
        run_all(outros.c);
    }
    outros = outros.p;
}
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
    else if (callback) {
        callback();
    }
}
function outro_and_destroy_block(block, lookup) {
    transition_out(block, 1, 1, () => {
        lookup.delete(block.key);
    });
}
function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
    let o = old_blocks.length;
    let n = list.length;
    let i = o;
    const old_indexes = {};
    while (i--)
        old_indexes[old_blocks[i].key] = i;
    const new_blocks = [];
    const new_lookup = new Map();
    const deltas = new Map();
    i = n;
    while (i--) {
        const child_ctx = get_context(ctx, list, i);
        const key = get_key(child_ctx);
        let block = lookup.get(key);
        if (!block) {
            block = create_each_block(key, child_ctx);
            block.c();
        }
        else if (dynamic) {
            block.p(child_ctx, dirty);
        }
        new_lookup.set(key, new_blocks[i] = block);
        if (key in old_indexes)
            deltas.set(key, Math.abs(i - old_indexes[key]));
    }
    const will_move = new Set();
    const did_move = new Set();
    function insert(block) {
        transition_in(block, 1);
        block.m(node, next);
        lookup.set(block.key, block);
        next = block.first;
        n--;
    }
    while (o && n) {
        const new_block = new_blocks[n - 1];
        const old_block = old_blocks[o - 1];
        const new_key = new_block.key;
        const old_key = old_block.key;
        if (new_block === old_block) {
            // do nothing
            next = new_block.first;
            o--;
            n--;
        }
        else if (!new_lookup.has(old_key)) {
            // remove old block
            destroy(old_block, lookup);
            o--;
        }
        else if (!lookup.has(new_key) || will_move.has(new_key)) {
            insert(new_block);
        }
        else if (did_move.has(old_key)) {
            o--;
        }
        else if (deltas.get(new_key) > deltas.get(old_key)) {
            did_move.add(new_key);
            insert(new_block);
        }
        else {
            will_move.add(old_key);
            o--;
        }
    }
    while (o--) {
        const old_block = old_blocks[o];
        if (!new_lookup.has(old_block.key))
            destroy(old_block, lookup);
    }
    while (n)
        insert(new_blocks[n - 1]);
    return new_blocks;
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

const subscriber_queue = [];
/**
 * Creates a `Readable` store that allows reading by subscription.
 * @param value initial value
 * @param {StartStopNotifier}start start and stop notifications for subscriptions
 */
function readable(value, start) {
    return {
        subscribe: writable(value, start).subscribe
    };
}
/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 * @param {*=}value initial value
 * @param {StartStopNotifier=}start start and stop notifications for subscriptions
 */
function writable(value, start = noop) {
    let stop;
    const subscribers = new Set();
    function set(new_value) {
        if (safe_not_equal(value, new_value)) {
            value = new_value;
            if (stop) { // store is ready
                const run_queue = !subscriber_queue.length;
                for (const subscriber of subscribers) {
                    subscriber[1]();
                    subscriber_queue.push(subscriber, value);
                }
                if (run_queue) {
                    for (let i = 0; i < subscriber_queue.length; i += 2) {
                        subscriber_queue[i][0](subscriber_queue[i + 1]);
                    }
                    subscriber_queue.length = 0;
                }
            }
        }
    }
    function update(fn) {
        set(fn(value));
    }
    function subscribe(run, invalidate = noop) {
        const subscriber = [run, invalidate];
        subscribers.add(subscriber);
        if (subscribers.size === 1) {
            stop = start(set) || noop;
        }
        run(value);
        return () => {
            subscribers.delete(subscriber);
            if (subscribers.size === 0) {
                stop();
                stop = null;
            }
        };
    }
    return { set, update, subscribe };
}
function derived(stores, fn, initial_value) {
    const single = !Array.isArray(stores);
    const stores_array = single
        ? [stores]
        : stores;
    const auto = fn.length < 2;
    return readable(initial_value, (set) => {
        let inited = false;
        const values = [];
        let pending = 0;
        let cleanup = noop;
        const sync = () => {
            if (pending) {
                return;
            }
            cleanup();
            const result = fn(single ? values[0] : values, set);
            if (auto) {
                set(result);
            }
            else {
                cleanup = is_function(result) ? result : noop;
            }
        };
        const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
            values[i] = value;
            pending &= ~(1 << i);
            if (inited) {
                sync();
            }
        }, () => {
            pending |= (1 << i);
        }));
        inited = true;
        sync();
        return function stop() {
            run_all(unsubscribers);
            cleanup();
        };
    });
}

const Type = {
  init: 'init',
  reset: 'reset',
  add: 'add',
  modify: 'modify',
  remove: 'remove',
};

const Direction = {
  top: 'top',
  bottom: 'bottom',
};

const store = writable({ items: [] });

derived(store, (state) => state.items);

let previous = [];
const changes = derived(store, (state, set) => {
  set([state.items, previous]);
  previous = state.items;
});

const type = derived(changes, (state) => {
  const [newer, older] = state;

  if (!!newer && newer.length === 0 && older.length === 0) return Type.init
  if (!!newer && !!older && newer.length - older.length > 0) return Type.add
  if (!!newer && !!older && newer.length === older.length) return Type.modify
  if (!!newer && !!older && newer.length - older.length < 0) return Type.remove
});

const load = (items) => store.update((state) => ({ ...state, items: [...items] }));

const reset = () => {
  previous = [];
};

const getLoaderHeight = async (viewport, tick) => {
  const previousTop = getFirstRowTop(viewport);
  await tick();
  const currentTop = getFirstRowTop(viewport);

  return previousTop - currentTop < 0 ? 0 : previousTop - currentTop
};

function getFirstRowTop(viewport) {
  const element = viewport.querySelector('virtual-infinite-list-row');
  return element?.getBoundingClientRect().top ?? 0
}

function getFirstItemMarginTop(viewport) {
  const slotTemplate = viewport.querySelector('virtual-infinite-list-row').firstElementChild;
  if (!slotTemplate) return 0
  const marginTop = getMarginTop(slotTemplate);
  if (marginTop > 0) return marginTop
  const slotItemTemplate = slotTemplate.firstElementChild;
  if (!slotItemTemplate) return 0
  return getMarginTop(slotItemTemplate)
}
function getMarginTop(element) {
  const style = getComputedStyle(element);
  const marginTop = +style.marginTop.replace('px', '');
  return marginTop
}

/* src/VirtualInfiniteList.svelte generated by Svelte v3.49.0 */

function add_css(target) {
	append_styles(target, "svelte-1kggtm4", "virtual-infinite-list-viewport.svelte-1kggtm4{position:relative;overflow-y:auto;-webkit-overflow-scrolling:touch;display:block}virtual-infinite-list-contents.svelte-1kggtm4,virtual-infinite-list-row.svelte-1kggtm4{display:block}virtual-infinite-list-row.svelte-1kggtm4{overflow:hidden}");
}

const get_empty_slot_changes = dirty => ({});
const get_empty_slot_context = ctx => ({});
const get_loader_slot_changes_2 = dirty => ({});
const get_loader_slot_context_2 = ctx => ({});
const get_loader_slot_changes_1 = dirty => ({});
const get_loader_slot_context_1 = ctx => ({});

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[44] = list[i];
	return child_ctx;
}

const get_item_slot_changes = dirty => ({ item: dirty[0] & /*visible*/ 512 });
const get_item_slot_context = ctx => ({ item: /*row*/ ctx[44].data });
const get_loader_slot_changes = dirty => ({});
const get_loader_slot_context = ctx => ({});

// (405:46) 
function create_if_block_4(ctx) {
	let current;
	const loader_slot_template = /*#slots*/ ctx[28].loader;
	const loader_slot = create_slot(loader_slot_template, ctx, /*$$scope*/ ctx[27], get_loader_slot_context_2);

	return {
		c() {
			if (loader_slot) loader_slot.c();
		},
		m(target, anchor) {
			if (loader_slot) {
				loader_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (loader_slot) {
				if (loader_slot.p && (!current || dirty[0] & /*$$scope*/ 134217728)) {
					update_slot_base(
						loader_slot,
						loader_slot_template,
						ctx,
						/*$$scope*/ ctx[27],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[27])
						: get_slot_changes(loader_slot_template, /*$$scope*/ ctx[27], dirty, get_loader_slot_changes_2),
						get_loader_slot_context_2
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(loader_slot, local);
			current = true;
		},
		o(local) {
			transition_out(loader_slot, local);
			current = false;
		},
		d(detaching) {
			if (loader_slot) loader_slot.d(detaching);
		}
	};
}

// (391:4) {#if visible.length > 0}
function create_if_block_1(ctx) {
	let t0;
	let each_blocks = [];
	let each_1_lookup = new Map();
	let t1;
	let if_block1_anchor;
	let current;
	let if_block0 = /*loading*/ ctx[2] && /*direction*/ ctx[1] !== 'bottom' && create_if_block_3(ctx);
	let each_value = /*visible*/ ctx[9];
	const get_key = ctx => /*row*/ ctx[44].index;

	for (let i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
	}

	let if_block1 = /*loading*/ ctx[2] && /*direction*/ ctx[1] !== 'top' && create_if_block_2(ctx);

	return {
		c() {
			if (if_block0) if_block0.c();
			t0 = space();

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t1 = space();
			if (if_block1) if_block1.c();
			if_block1_anchor = empty();
		},
		m(target, anchor) {
			if (if_block0) if_block0.m(target, anchor);
			insert(target, t0, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(target, anchor);
			}

			insert(target, t1, anchor);
			if (if_block1) if_block1.m(target, anchor);
			insert(target, if_block1_anchor, anchor);
			current = true;
		},
		p(ctx, dirty) {
			if (/*loading*/ ctx[2] && /*direction*/ ctx[1] !== 'bottom') {
				if (if_block0) {
					if_block0.p(ctx, dirty);

					if (dirty[0] & /*loading, direction*/ 6) {
						transition_in(if_block0, 1);
					}
				} else {
					if_block0 = create_if_block_3(ctx);
					if_block0.c();
					transition_in(if_block0, 1);
					if_block0.m(t0.parentNode, t0);
				}
			} else if (if_block0) {
				group_outros();

				transition_out(if_block0, 1, 1, () => {
					if_block0 = null;
				});

				check_outros();
			}

			if (dirty[0] & /*visible, uniqueKey, $$scope*/ 134218248) {
				each_value = /*visible*/ ctx[9];
				group_outros();
				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, t1.parentNode, outro_and_destroy_block, create_each_block, t1, get_each_context);
				check_outros();
			}

			if (/*loading*/ ctx[2] && /*direction*/ ctx[1] !== 'top') {
				if (if_block1) {
					if_block1.p(ctx, dirty);

					if (dirty[0] & /*loading, direction*/ 6) {
						transition_in(if_block1, 1);
					}
				} else {
					if_block1 = create_if_block_2(ctx);
					if_block1.c();
					transition_in(if_block1, 1);
					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
				}
			} else if (if_block1) {
				group_outros();

				transition_out(if_block1, 1, 1, () => {
					if_block1 = null;
				});

				check_outros();
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block0);

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			transition_in(if_block1);
			current = true;
		},
		o(local) {
			transition_out(if_block0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			transition_out(if_block1);
			current = false;
		},
		d(detaching) {
			if (if_block0) if_block0.d(detaching);
			if (detaching) detach(t0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].d(detaching);
			}

			if (detaching) detach(t1);
			if (if_block1) if_block1.d(detaching);
			if (detaching) detach(if_block1_anchor);
		}
	};
}

// (392:6) {#if loading && direction !== 'bottom'}
function create_if_block_3(ctx) {
	let current;
	const loader_slot_template = /*#slots*/ ctx[28].loader;
	const loader_slot = create_slot(loader_slot_template, ctx, /*$$scope*/ ctx[27], get_loader_slot_context);

	return {
		c() {
			if (loader_slot) loader_slot.c();
		},
		m(target, anchor) {
			if (loader_slot) {
				loader_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (loader_slot) {
				if (loader_slot.p && (!current || dirty[0] & /*$$scope*/ 134217728)) {
					update_slot_base(
						loader_slot,
						loader_slot_template,
						ctx,
						/*$$scope*/ ctx[27],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[27])
						: get_slot_changes(loader_slot_template, /*$$scope*/ ctx[27], dirty, get_loader_slot_changes),
						get_loader_slot_context
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(loader_slot, local);
			current = true;
		},
		o(local) {
			transition_out(loader_slot, local);
			current = false;
		},
		d(detaching) {
			if (loader_slot) loader_slot.d(detaching);
		}
	};
}

// (399:44) Template Not Found!!!
function fallback_block(ctx) {
	let t;

	return {
		c() {
			t = text("Template Not Found!!!");
		},
		m(target, anchor) {
			insert(target, t, anchor);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (395:6) {#each visible as row (row.index)}
function create_each_block(key_1, ctx) {
	let virtual_infinite_list_row;
	let virtual_infinite_list_row_id_value;
	let current;
	const item_slot_template = /*#slots*/ ctx[28].item;
	const item_slot = create_slot(item_slot_template, ctx, /*$$scope*/ ctx[27], get_item_slot_context);
	const item_slot_or_fallback = item_slot || fallback_block();

	return {
		key: key_1,
		first: null,
		c() {
			virtual_infinite_list_row = element("virtual-infinite-list-row");
			if (item_slot_or_fallback) item_slot_or_fallback.c();
			set_custom_element_data(virtual_infinite_list_row, "id", virtual_infinite_list_row_id_value = 'svelte-virtual-infinite-list-items-' + String(/*row*/ ctx[44].data[/*uniqueKey*/ ctx[3]]));
			set_custom_element_data(virtual_infinite_list_row, "class", "svelte-1kggtm4");
			this.first = virtual_infinite_list_row;
		},
		m(target, anchor) {
			insert(target, virtual_infinite_list_row, anchor);

			if (item_slot_or_fallback) {
				item_slot_or_fallback.m(virtual_infinite_list_row, null);
			}

			current = true;
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (item_slot) {
				if (item_slot.p && (!current || dirty[0] & /*$$scope, visible*/ 134218240)) {
					update_slot_base(
						item_slot,
						item_slot_template,
						ctx,
						/*$$scope*/ ctx[27],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[27])
						: get_slot_changes(item_slot_template, /*$$scope*/ ctx[27], dirty, get_item_slot_changes),
						get_item_slot_context
					);
				}
			}

			if (!current || dirty[0] & /*visible, uniqueKey*/ 520 && virtual_infinite_list_row_id_value !== (virtual_infinite_list_row_id_value = 'svelte-virtual-infinite-list-items-' + String(/*row*/ ctx[44].data[/*uniqueKey*/ ctx[3]]))) {
				set_custom_element_data(virtual_infinite_list_row, "id", virtual_infinite_list_row_id_value);
			}
		},
		i(local) {
			if (current) return;
			transition_in(item_slot_or_fallback, local);
			current = true;
		},
		o(local) {
			transition_out(item_slot_or_fallback, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(virtual_infinite_list_row);
			if (item_slot_or_fallback) item_slot_or_fallback.d(detaching);
		}
	};
}

// (402:6) {#if loading && direction !== 'top'}
function create_if_block_2(ctx) {
	let current;
	const loader_slot_template = /*#slots*/ ctx[28].loader;
	const loader_slot = create_slot(loader_slot_template, ctx, /*$$scope*/ ctx[27], get_loader_slot_context_1);

	return {
		c() {
			if (loader_slot) loader_slot.c();
		},
		m(target, anchor) {
			if (loader_slot) {
				loader_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (loader_slot) {
				if (loader_slot.p && (!current || dirty[0] & /*$$scope*/ 134217728)) {
					update_slot_base(
						loader_slot,
						loader_slot_template,
						ctx,
						/*$$scope*/ ctx[27],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[27])
						: get_slot_changes(loader_slot_template, /*$$scope*/ ctx[27], dirty, get_loader_slot_changes_1),
						get_loader_slot_context_1
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(loader_slot, local);
			current = true;
		},
		o(local) {
			transition_out(loader_slot, local);
			current = false;
		},
		d(detaching) {
			if (loader_slot) loader_slot.d(detaching);
		}
	};
}

// (409:2) {#if !loading && visible.length === 0}
function create_if_block(ctx) {
	let current;
	const empty_slot_template = /*#slots*/ ctx[28].empty;
	const empty_slot = create_slot(empty_slot_template, ctx, /*$$scope*/ ctx[27], get_empty_slot_context);

	return {
		c() {
			if (empty_slot) empty_slot.c();
		},
		m(target, anchor) {
			if (empty_slot) {
				empty_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (empty_slot) {
				if (empty_slot.p && (!current || dirty[0] & /*$$scope*/ 134217728)) {
					update_slot_base(
						empty_slot,
						empty_slot_template,
						ctx,
						/*$$scope*/ ctx[27],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[27])
						: get_slot_changes(empty_slot_template, /*$$scope*/ ctx[27], dirty, get_empty_slot_changes),
						get_empty_slot_context
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(empty_slot, local);
			current = true;
		},
		o(local) {
			transition_out(empty_slot, local);
			current = false;
		},
		d(detaching) {
			if (empty_slot) empty_slot.d(detaching);
		}
	};
}

function create_fragment(ctx) {
	let virtual_infinite_list_viewport;
	let virtual_infinite_list_contents;
	let current_block_type_index;
	let if_block0;
	let t;
	let virtual_infinite_list_viewport_resize_listener;
	let current;
	let mounted;
	let dispose;
	const if_block_creators = [create_if_block_1, create_if_block_4];
	const if_blocks = [];

	function select_block_type(ctx, dirty) {
		if (/*visible*/ ctx[9].length > 0) return 0;
		if (/*visible*/ ctx[9].length === 0 && /*loading*/ ctx[2]) return 1;
		return -1;
	}

	if (~(current_block_type_index = select_block_type(ctx))) {
		if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
	}

	let if_block1 = !/*loading*/ ctx[2] && /*visible*/ ctx[9].length === 0 && create_if_block(ctx);

	return {
		c() {
			virtual_infinite_list_viewport = element("virtual-infinite-list-viewport");
			virtual_infinite_list_contents = element("virtual-infinite-list-contents");
			if (if_block0) if_block0.c();
			t = space();
			if (if_block1) if_block1.c();
			set_style(virtual_infinite_list_contents, "padding-top", /*top*/ ctx[7] + "px");
			set_style(virtual_infinite_list_contents, "padding-bottom", /*bottom*/ ctx[8] + "px");
			set_custom_element_data(virtual_infinite_list_contents, "class", "svelte-1kggtm4");
			set_style(virtual_infinite_list_viewport, "height", /*height*/ ctx[0]);
			set_custom_element_data(virtual_infinite_list_viewport, "class", "svelte-1kggtm4");
			add_render_callback(() => /*virtual_infinite_list_viewport_elementresize_handler*/ ctx[31].call(virtual_infinite_list_viewport));
		},
		m(target, anchor) {
			insert(target, virtual_infinite_list_viewport, anchor);
			append(virtual_infinite_list_viewport, virtual_infinite_list_contents);

			if (~current_block_type_index) {
				if_blocks[current_block_type_index].m(virtual_infinite_list_contents, null);
			}

			/*virtual_infinite_list_contents_binding*/ ctx[29](virtual_infinite_list_contents);
			append(virtual_infinite_list_viewport, t);
			if (if_block1) if_block1.m(virtual_infinite_list_viewport, null);
			/*virtual_infinite_list_viewport_binding*/ ctx[30](virtual_infinite_list_viewport);
			virtual_infinite_list_viewport_resize_listener = add_resize_listener(virtual_infinite_list_viewport, /*virtual_infinite_list_viewport_elementresize_handler*/ ctx[31].bind(virtual_infinite_list_viewport));
			current = true;

			if (!mounted) {
				dispose = [
					listen(window, "resize", /*onResize*/ ctx[11]),
					listen(virtual_infinite_list_viewport, "scroll", /*handleScroll*/ ctx[10])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);

			if (current_block_type_index === previous_block_index) {
				if (~current_block_type_index) {
					if_blocks[current_block_type_index].p(ctx, dirty);
				}
			} else {
				if (if_block0) {
					group_outros();

					transition_out(if_blocks[previous_block_index], 1, 1, () => {
						if_blocks[previous_block_index] = null;
					});

					check_outros();
				}

				if (~current_block_type_index) {
					if_block0 = if_blocks[current_block_type_index];

					if (!if_block0) {
						if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
						if_block0.c();
					} else {
						if_block0.p(ctx, dirty);
					}

					transition_in(if_block0, 1);
					if_block0.m(virtual_infinite_list_contents, null);
				} else {
					if_block0 = null;
				}
			}

			if (!current || dirty[0] & /*top*/ 128) {
				set_style(virtual_infinite_list_contents, "padding-top", /*top*/ ctx[7] + "px");
			}

			if (!current || dirty[0] & /*bottom*/ 256) {
				set_style(virtual_infinite_list_contents, "padding-bottom", /*bottom*/ ctx[8] + "px");
			}

			if (!/*loading*/ ctx[2] && /*visible*/ ctx[9].length === 0) {
				if (if_block1) {
					if_block1.p(ctx, dirty);

					if (dirty[0] & /*loading, visible*/ 516) {
						transition_in(if_block1, 1);
					}
				} else {
					if_block1 = create_if_block(ctx);
					if_block1.c();
					transition_in(if_block1, 1);
					if_block1.m(virtual_infinite_list_viewport, null);
				}
			} else if (if_block1) {
				group_outros();

				transition_out(if_block1, 1, 1, () => {
					if_block1 = null;
				});

				check_outros();
			}

			if (!current || dirty[0] & /*height*/ 1) {
				set_style(virtual_infinite_list_viewport, "height", /*height*/ ctx[0]);
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block0);
			transition_in(if_block1);
			current = true;
		},
		o(local) {
			transition_out(if_block0);
			transition_out(if_block1);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(virtual_infinite_list_viewport);

			if (~current_block_type_index) {
				if_blocks[current_block_type_index].d();
			}

			/*virtual_infinite_list_contents_binding*/ ctx[29](null);
			if (if_block1) if_block1.d();
			/*virtual_infinite_list_viewport_binding*/ ctx[30](null);
			virtual_infinite_list_viewport_resize_listener();
			mounted = false;
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let visible;
	let $type;
	let $changes;
	component_subscribe($$self, type, $$value => $$invalidate(25, $type = $$value));
	component_subscribe($$self, changes, $$value => $$invalidate(26, $changes = $$value));
	let { $$slots: slots = {}, $$scope } = $$props;
	const dispatch = createEventDispatcher();
	let { items } = $$props;
	let { height = '100%' } = $$props;
	let { itemHeight = undefined } = $$props;
	let { direction } = $$props;
	let { loading = false } = $$props;
	let { uniqueKey = undefined } = $$props;
	let { persists } = $$props;
	let { maxItemCountPerLoad = 0 } = $$props;
	let { start = 0 } = $$props;
	let { end = 0 } = $$props;

	// local state
	let heightMap = [];

	let rows;
	let viewport;
	let contents;
	let viewportHeight = 0;
	let top = 0;
	let bottom = 0;
	let averageHeight;
	let initialized = false;
	let searching = false;

	async function onChange(type, newers, olders) {
		switch (type) {
			case Type.add:
				{
					const reachedTop = viewport.scrollTop === 0;

					reachedTop
					? await onTop(newers, olders)
					: await refresh(newers, viewportHeight, itemHeight);

					break;
				}
			case Type.init:
				{
					await reset$1();
					await refresh(newers, viewportHeight, itemHeight);
					break;
				}
			case Type.modify:
				{
					await refresh(newers, viewportHeight, itemHeight);
					break;
				}
			case Type.remove:
				{
					await onRemove();
					if (newers && newers.length === 0) await reset$1();
					break;
				}
		}

		if (newers && newers.length > 0 && olders && olders.length === 0) dispatch('initialize');
	}

	async function onTop(newers, olders) {
		const loader = await getLoaderHeight(viewport, async () => await refresh(newers, viewportHeight, itemHeight));
		const mt = getFirstItemMarginTop(viewport);
		const diff = newers.length - olders.length;

		const previousDom = rows[diff]
		? rows[diff].firstChild
		: rows[diff - 1] ? rows[diff - 1].firstChild : undefined; // after second time
		// first time

		if (direction !== Direction.bottom && (!previousDom || persists === 0 && $type !== Type.init)) {
			console.warn(`[Virtual Infinite List]
    The number of items exceeds 'persists' or 'maxItemCountPerLoad',
    so the offset after loaded may be significantly shift.`);
		}

		const t = viewport.getBoundingClientRect().top + loader + mt;

		const top = previousDom
		? previousDom.getBoundingClientRect().top - t
		: heightMap.slice(0, diff).reduce((pre, curr) => pre + curr, 0) - t;

		viewport.scrollTo(0, top === 0 ? top + 1 : top);
	}

	async function onRemove() {
		const previous = viewport.scrollTop;
		await tick();
		viewport.scrollTo(0, previous);
		await handleScroll();
	}

	// whenever `items` changes, invalidate the current heightmap
	async function refresh(items, viewportHeight, itemHeight) {
		const { scrollTop } = viewport;
		await tick(); // wait until the DOM is up to date
		let contentHeight = top - scrollTop;
		let i = start;

		while (contentHeight < viewportHeight && i < items.length) {
			let row = rows[i - start];

			if (!row) {
				$$invalidate(15, end = i + 1);
				await tick(); // render the newly visible row
				row = rows[i - start];
			}

			const rowHeight = heightMap[i] = itemHeight || row.offsetHeight;
			contentHeight += rowHeight;
			i += 1;
		}

		$$invalidate(15, end = i);
		const remaining = items.length - end;
		averageHeight = (top + contentHeight) / end;
		$$invalidate(8, bottom = remaining * averageHeight);
		heightMap.length = items.length;
	}

	async function handleScroll() {
		const { scrollTop } = viewport;
		const oldStart = start;

		for (let v = 0; v < rows.length; v += 1) {
			heightMap[start + v] = itemHeight || rows[v].offsetHeight;
		}

		let i = 0;
		let y = 0;

		while (i < items.length) {
			const rowHeight = heightMap[i] || averageHeight;

			if (y + rowHeight > scrollTop) {
				$$invalidate(14, start = i);
				$$invalidate(7, top = y);
				break;
			}

			y += rowHeight;
			i += 1;
		}

		while (i < items.length) {
			y += heightMap[i] || averageHeight;
			i += 1;
			if (y > scrollTop + viewportHeight) break;
		}

		$$invalidate(15, end = i);
		const remaining = items.length - end;
		averageHeight = y / end;
		while (i < items.length) heightMap[i++] = averageHeight;
		$$invalidate(8, bottom = remaining * averageHeight);

		// prevent jumping if we scrolled up into unknown territory
		if (start < oldStart) {
			await tick();
			let expectedHeight = 0;
			let actualHeight = 0;

			for (let i = start; i < oldStart; i += 1) {
				if (rows[i - start]) {
					expectedHeight += heightMap[i];
					actualHeight += itemHeight || rows[i - start].offsetHeight;
				}
			}

			const d = actualHeight - expectedHeight;
			viewport.scrollTo(0, scrollTop + d);
		}
	} // TODO if we overestimated the space these
	// rows would occupy we may need to add some

	// more. maybe we can just call handleScroll again?
	function onScroll() {
		if (!viewport || loading || items.length === 0 || $type === Type.init || searching) return;
		const reachedTop = viewport.scrollTop === 0;
		const reachedBottom = viewport.scrollHeight - viewport.scrollTop === viewport.clientHeight;
		if (direction !== Direction.bottom && reachedTop) dispatch('infinite', { on: 'top' });
		if (direction !== Direction.top && reachedBottom) dispatch('infinite', { on: 'bottom' });
	}

	async function onResize() {
		if (!initialized || !viewport) return;
		await refresh(items, viewportHeight, itemHeight);
	}

	async function reset$1() {
		$$invalidate(24, initialized = false);
		$$invalidate(12, items = []);
		$$invalidate(7, top = 0);
		$$invalidate(8, bottom = 0);
		$$invalidate(14, start = 0);
		$$invalidate(15, end = 0);
		reset();
		await tick();
	}

	async function forceRefresh() {
		if (!initialized || !viewport) return;
		await handleScroll();
		await refresh(items, viewportHeight, itemHeight);
	}

	async function scrollTo(offset) {
		if (!initialized || !viewport) return;
		viewport.scrollTo(0, offset);
		await forceRefresh();
	}

	async function scrollToTop() {
		if (!initialized || !viewport) return;
		viewport.scrollTo(0, 0);
		await forceRefresh();
	}

	async function scrollToBottom() {
		if (!initialized || !viewport) return;
		viewport.scrollTo(0, viewportHeight + top + bottom);
		await forceRefresh();
	}

	async function scrollToIndex(index, options = { align: 'top' }) {
		if (typeof items[index] === 'undefined' || !initialized || !viewport) return false;

		if (!uniqueKey) {
			console.warn(`[Virtual Infinite List] You have to set 'uniqueKey' if you use this method.`);
			return false;
		}

		searching = true;
		const { found, top: t, itemRect } = await search(index);

		if (!found) {
			searching = false;
			return false;
		}

		let top = 0;

		switch (options.align) {
			case 'top':
				{
					top = t;
					break;
				}
			case 'bottom':
				{
					top = t - viewport.getBoundingClientRect().height + itemRect.height;
					break;
				}
			case 'center':
				{
					top = t - viewport.getBoundingClientRect().height / 2 + itemRect.height;
				}
		}

		if (top === 0) top = 1;
		if (top === viewport.clientHeight) top -= 1;
		viewport.scrollTo(0, top);
		await forceRefresh();
		if (viewport.scrollTop === 0) viewport.scrollTo(0, 1);
		if (viewport.scrollHeight - viewport.scrollTop === viewport.clientHeight) viewport.scrollTo(0, viewport.scrollTop - 1);
		searching = false;
		return true;
	}

	async function search(index) {
		viewport.scrollTo(0, 0);
		await forceRefresh();
		const isInBuffer = index < persists + 1;
		const coef = persists - 1;
		const to = isInBuffer ? 1 : index - coef;
		let result = getTop(index);
		if (result.found) return result;
		const h = heightMap.slice(0, index - 1).reduce((h, curr) => h + curr, 0);
		viewport.scrollTo(0, h);
		await forceRefresh();
		result = getTop(index);
		if (result.found) return result;

		if (!isInBuffer) {
			const h = heightMap.slice(0, to).reduce((h, curr) => h + curr, 0);
			viewport.scrollTo(0, h);
			await forceRefresh();
		}

		result = getTop(index);
		return result;
	}

	function getTop(index) {
		const element = contents.querySelector(`#svelte-virtual-infinite-list-items-${items[index][uniqueKey]}`);
		const viewportTop = viewport.getBoundingClientRect().top;

		if (element) {
			const itemRect = element.getBoundingClientRect();

			return {
				found: true,
				top: viewport.scrollTop + itemRect.top - viewportTop,
				itemRect
			};
		}

		return {
			found: false,
			top: 0,
			itemRect: undefined
		};
	}

	// trigger initial refresh
	onMount(() => {
		rows = contents.getElementsByTagName('virtual-infinite-list-row');
		viewport.addEventListener('scroll', onScroll, { passive: true });
	});

	onDestroy(() => {
		viewport.removeEventListener('scroll', onScroll);
	});

	function virtual_infinite_list_contents_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			contents = $$value;
			$$invalidate(5, contents);
		});
	}

	function virtual_infinite_list_viewport_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			viewport = $$value;
			$$invalidate(4, viewport);
		});
	}

	function virtual_infinite_list_viewport_elementresize_handler() {
		viewportHeight = this.offsetHeight;
		$$invalidate(6, viewportHeight);
	}

	$$self.$$set = $$props => {
		if ('items' in $$props) $$invalidate(12, items = $$props.items);
		if ('height' in $$props) $$invalidate(0, height = $$props.height);
		if ('itemHeight' in $$props) $$invalidate(16, itemHeight = $$props.itemHeight);
		if ('direction' in $$props) $$invalidate(1, direction = $$props.direction);
		if ('loading' in $$props) $$invalidate(2, loading = $$props.loading);
		if ('uniqueKey' in $$props) $$invalidate(3, uniqueKey = $$props.uniqueKey);
		if ('persists' in $$props) $$invalidate(13, persists = $$props.persists);
		if ('maxItemCountPerLoad' in $$props) $$invalidate(17, maxItemCountPerLoad = $$props.maxItemCountPerLoad);
		if ('start' in $$props) $$invalidate(14, start = $$props.start);
		if ('end' in $$props) $$invalidate(15, end = $$props.end);
		if ('$$scope' in $$props) $$invalidate(27, $$scope = $$props.$$scope);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty[0] & /*initialized, loading, viewport*/ 16777236) {
			if (!initialized && !loading && viewport) $$invalidate(24, initialized = true);
		}

		if ($$self.$$.dirty[0] & /*items*/ 4096) {
			if (items) load(items);
		}

		if ($$self.$$.dirty[0] & /*persists, maxItemCountPerLoad*/ 139264) {
			$$invalidate(13, persists = persists || maxItemCountPerLoad || 0);
		}

		if ($$self.$$.dirty[0] & /*initialized, items, start, end, persists*/ 16838656) {
			$$invalidate(9, visible = initialized
			? items.slice(start, end + persists).map((data, i) => ({ index: i + start, data }))
			: []);
		}

		if ($$self.$$.dirty[0] & /*$changes, $type*/ 100663296) {
			if ($changes && $type) onChange($type, ...$changes);
		}
	};

	return [
		height,
		direction,
		loading,
		uniqueKey,
		viewport,
		contents,
		viewportHeight,
		top,
		bottom,
		visible,
		handleScroll,
		onResize,
		items,
		persists,
		start,
		end,
		itemHeight,
		maxItemCountPerLoad,
		reset$1,
		forceRefresh,
		scrollTo,
		scrollToTop,
		scrollToBottom,
		scrollToIndex,
		initialized,
		$type,
		$changes,
		$$scope,
		slots,
		virtual_infinite_list_contents_binding,
		virtual_infinite_list_viewport_binding,
		virtual_infinite_list_viewport_elementresize_handler
	];
}

class VirtualInfiniteList extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance,
			create_fragment,
			safe_not_equal,
			{
				items: 12,
				height: 0,
				itemHeight: 16,
				direction: 1,
				loading: 2,
				uniqueKey: 3,
				persists: 13,
				maxItemCountPerLoad: 17,
				start: 14,
				end: 15,
				reset: 18,
				forceRefresh: 19,
				scrollTo: 20,
				scrollToTop: 21,
				scrollToBottom: 22,
				scrollToIndex: 23
			},
			add_css,
			[-1, -1]
		);
	}

	get reset() {
		return this.$$.ctx[18];
	}

	get forceRefresh() {
		return this.$$.ctx[19];
	}

	get scrollTo() {
		return this.$$.ctx[20];
	}

	get scrollToTop() {
		return this.$$.ctx[21];
	}

	get scrollToBottom() {
		return this.$$.ctx[22];
	}

	get scrollToIndex() {
		return this.$$.ctx[23];
	}
}

export { VirtualInfiniteList as default };
