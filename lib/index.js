(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global['svelte-virtual-infinite-list'] = factory());
}(this, (function () { 'use strict';

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
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }

    function append(target, node) {
        target.appendChild(node);
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
            node[prop] = value;
        }
        else {
            attr(node, prop, value);
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
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
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
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
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
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
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
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
        flushing = false;
        seen_callbacks.clear();
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
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
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
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
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

    /* src/VirtualInfiniteList.svelte generated by Svelte v3.37.0 */

    function add_css() {
    	var style = element("style");
    	style.id = "svelte-1kggtm4-style";
    	style.textContent = "virtual-infinite-list-viewport.svelte-1kggtm4{position:relative;overflow-y:auto;-webkit-overflow-scrolling:touch;display:block}virtual-infinite-list-contents.svelte-1kggtm4,virtual-infinite-list-row.svelte-1kggtm4{display:block}virtual-infinite-list-row.svelte-1kggtm4{overflow:hidden}";
    	append(document.head, style);
    }

    const get_empty_slot_changes = dirty => ({});
    const get_empty_slot_context = ctx => ({});
    const get_loader_slot_changes_1 = dirty => ({});
    const get_loader_slot_context_1 = ctx => ({});

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[43] = list[i];
    	return child_ctx;
    }

    const get_item_slot_changes = dirty => ({ item: dirty[0] & /*visible*/ 256 });
    const get_item_slot_context = ctx => ({ item: /*row*/ ctx[43].data });
    const get_loader_slot_changes = dirty => ({});
    const get_loader_slot_context = ctx => ({});

    // (297:4) {#if loading && direction === 'top'}
    function create_if_block_3(ctx) {
    	let current;
    	const loader_slot_template = /*#slots*/ ctx[23].loader;
    	const loader_slot = create_slot(loader_slot_template, ctx, /*$$scope*/ ctx[22], get_loader_slot_context);

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
    				if (loader_slot.p && dirty[0] & /*$$scope*/ 4194304) {
    					update_slot(loader_slot, loader_slot_template, ctx, /*$$scope*/ ctx[22], dirty, get_loader_slot_changes, get_loader_slot_context);
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

    // (301:4) {#if visible.length > 0}
    function create_if_block_2(ctx) {
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let current;
    	let each_value = /*visible*/ ctx[8];
    	const get_key = ctx => /*row*/ ctx[43].index;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*$$scope, visible*/ 4194560) {
    				each_value = /*visible*/ ctx[8];
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block, each_1_anchor, get_each_context);
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (304:44) Template Not Found!!!
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

    // (302:6) {#each visible as row (row.index)}
    function create_each_block(key_1, ctx) {
    	let virtual_infinite_list_row;
    	let t;
    	let current;
    	const item_slot_template = /*#slots*/ ctx[23].item;
    	const item_slot = create_slot(item_slot_template, ctx, /*$$scope*/ ctx[22], get_item_slot_context);
    	const item_slot_or_fallback = item_slot || fallback_block();

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			virtual_infinite_list_row = element("virtual-infinite-list-row");
    			if (item_slot_or_fallback) item_slot_or_fallback.c();
    			t = space();
    			set_custom_element_data(virtual_infinite_list_row, "class", "svelte-1kggtm4");
    			this.first = virtual_infinite_list_row;
    		},
    		m(target, anchor) {
    			insert(target, virtual_infinite_list_row, anchor);

    			if (item_slot_or_fallback) {
    				item_slot_or_fallback.m(virtual_infinite_list_row, null);
    			}

    			append(virtual_infinite_list_row, t);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (item_slot) {
    				if (item_slot.p && dirty[0] & /*$$scope, visible*/ 4194560) {
    					update_slot(item_slot, item_slot_template, ctx, /*$$scope*/ ctx[22], dirty, get_item_slot_changes, get_item_slot_context);
    				}
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

    // (309:4) {#if loading && direction === 'bottom'}
    function create_if_block_1(ctx) {
    	let current;
    	const loader_slot_template = /*#slots*/ ctx[23].loader;
    	const loader_slot = create_slot(loader_slot_template, ctx, /*$$scope*/ ctx[22], get_loader_slot_context_1);

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
    				if (loader_slot.p && dirty[0] & /*$$scope*/ 4194304) {
    					update_slot(loader_slot, loader_slot_template, ctx, /*$$scope*/ ctx[22], dirty, get_loader_slot_changes_1, get_loader_slot_context_1);
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

    // (313:2) {#if !loading && visible.length === 0}
    function create_if_block(ctx) {
    	let current;
    	const empty_slot_template = /*#slots*/ ctx[23].empty;
    	const empty_slot = create_slot(empty_slot_template, ctx, /*$$scope*/ ctx[22], get_empty_slot_context);

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
    				if (empty_slot.p && dirty[0] & /*$$scope*/ 4194304) {
    					update_slot(empty_slot, empty_slot_template, ctx, /*$$scope*/ ctx[22], dirty, get_empty_slot_changes, get_empty_slot_context);
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
    	let t0;
    	let t1;
    	let t2;
    	let virtual_infinite_list_viewport_resize_listener;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*loading*/ ctx[0] && /*direction*/ ctx[1] === "top" && create_if_block_3(ctx);
    	let if_block1 = /*visible*/ ctx[8].length > 0 && create_if_block_2(ctx);
    	let if_block2 = /*loading*/ ctx[0] && /*direction*/ ctx[1] === "bottom" && create_if_block_1(ctx);
    	let if_block3 = !/*loading*/ ctx[0] && /*visible*/ ctx[8].length === 0 && create_if_block(ctx);

    	return {
    		c() {
    			virtual_infinite_list_viewport = element("virtual-infinite-list-viewport");
    			virtual_infinite_list_contents = element("virtual-infinite-list-contents");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			t2 = space();
    			if (if_block3) if_block3.c();
    			set_style(virtual_infinite_list_contents, "padding-top", /*top*/ ctx[6] + "px");
    			set_style(virtual_infinite_list_contents, "padding-bottom", /*bottom*/ ctx[7] + "px");
    			set_custom_element_data(virtual_infinite_list_contents, "class", "svelte-1kggtm4");
    			set_style(virtual_infinite_list_viewport, "height", /*height*/ ctx[2]);
    			set_custom_element_data(virtual_infinite_list_viewport, "class", "svelte-1kggtm4");
    			add_render_callback(() => /*virtual_infinite_list_viewport_elementresize_handler*/ ctx[26].call(virtual_infinite_list_viewport));
    		},
    		m(target, anchor) {
    			insert(target, virtual_infinite_list_viewport, anchor);
    			append(virtual_infinite_list_viewport, virtual_infinite_list_contents);
    			if (if_block0) if_block0.m(virtual_infinite_list_contents, null);
    			append(virtual_infinite_list_contents, t0);
    			if (if_block1) if_block1.m(virtual_infinite_list_contents, null);
    			append(virtual_infinite_list_contents, t1);
    			if (if_block2) if_block2.m(virtual_infinite_list_contents, null);
    			/*virtual_infinite_list_contents_binding*/ ctx[24](virtual_infinite_list_contents);
    			append(virtual_infinite_list_viewport, t2);
    			if (if_block3) if_block3.m(virtual_infinite_list_viewport, null);
    			/*virtual_infinite_list_viewport_binding*/ ctx[25](virtual_infinite_list_viewport);
    			virtual_infinite_list_viewport_resize_listener = add_resize_listener(virtual_infinite_list_viewport, /*virtual_infinite_list_viewport_elementresize_handler*/ ctx[26].bind(virtual_infinite_list_viewport));
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(window, "resize", /*onResize*/ ctx[10]),
    					listen(virtual_infinite_list_viewport, "scroll", /*onScroll*/ ctx[9])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*loading*/ ctx[0] && /*direction*/ ctx[1] === "top") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*loading, direction*/ 3) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(virtual_infinite_list_contents, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*visible*/ ctx[8].length > 0) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*visible*/ 256) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_2(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(virtual_infinite_list_contents, t1);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (/*loading*/ ctx[0] && /*direction*/ ctx[1] === "bottom") {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*loading, direction*/ 3) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_1(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(virtual_infinite_list_contents, null);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty[0] & /*top*/ 64) {
    				set_style(virtual_infinite_list_contents, "padding-top", /*top*/ ctx[6] + "px");
    			}

    			if (!current || dirty[0] & /*bottom*/ 128) {
    				set_style(virtual_infinite_list_contents, "padding-bottom", /*bottom*/ ctx[7] + "px");
    			}

    			if (!/*loading*/ ctx[0] && /*visible*/ ctx[8].length === 0) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty[0] & /*loading, visible*/ 257) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(virtual_infinite_list_viewport, null);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty[0] & /*height*/ 4) {
    				set_style(virtual_infinite_list_viewport, "height", /*height*/ ctx[2]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(virtual_infinite_list_viewport);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			/*virtual_infinite_list_contents_binding*/ ctx[24](null);
    			if (if_block3) if_block3.d();
    			/*virtual_infinite_list_viewport_binding*/ ctx[25](null);
    			virtual_infinite_list_viewport_resize_listener();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function getRowTop(viewport) {
    	const element = viewport.querySelector("virtual-infinite-list-row");
    	return element?.getBoundingClientRect().top ?? 0;
    }

    function getSlotItemMarginTop(viewport) {
    	const slotTemplate = viewport.querySelector("virtual-infinite-list-row").firstElementChild;
    	if (!slotTemplate) return 0;
    	const slotItemTemplate = slotTemplate.firstElementChild;
    	if (!slotItemTemplate) return 0;
    	const style = getComputedStyle(slotItemTemplate);
    	return Number(style.marginTop.replace("px", ""));
    }

    function instance($$self, $$props, $$invalidate) {
    	let initialized;
    	let newItemsLoaded;
    	let preItemsExisted;
    	let visible;
    	let itemsRemoved;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	const dispatch = createEventDispatcher();
    	let { items } = $$props;
    	let { loading } = $$props;
    	let { direction } = $$props;
    	let { height = "100%" } = $$props;
    	let { itemHeight = undefined } = $$props;
    	let { maxItemCountPerLoad = 0 } = $$props;

    	function scrollTo(offset) {
    		mounted && viewport && $$invalidate(3, viewport.scrollTop = offset, viewport);
    	}

    	let { start = 0 } = $$props;
    	let { end = 0 } = $$props;
    	let heightMap = [];
    	let rows;
    	let viewport;
    	let contents;
    	let viewportHeight = 0;
    	let mounted = false;
    	let top = 0;
    	let bottom = 0;
    	let averageHeight = 0;
    	let preItems = [];
    	let firstItemTopOnLoading;
    	let firstItemTopOnLoaded;
    	let slotItemMarginTop;

    	async function onLoadAtTop() {
    		if (!firstItemTopOnLoading) firstItemTopOnLoading = getRowTop(viewport);
    		await refresh(items, viewportHeight, itemHeight);
    		if (!firstItemTopOnLoaded) firstItemTopOnLoaded = getRowTop(viewport);
    		if (typeof slotItemMarginTop === "undefined") slotItemMarginTop = getSlotItemMarginTop(viewport);

    		const loaderHeight = firstItemTopOnLoading - firstItemTopOnLoaded < 0
    		? 0
    		: firstItemTopOnLoading - firstItemTopOnLoaded;

    		const diff = items.length - preItems.length;

    		if (initialized) {
    			const scrollTop = calculateScrollTop(rows, viewport, heightMap, diff, loaderHeight, slotItemMarginTop);
    			$$invalidate(3, viewport.scrollTop = scrollTop === 0 ? scrollTop + 5 : scrollTop, viewport);
    		}

    		if (initialized && !preItemsExisted) dispatch("initialize");
    		$$invalidate(18, preItems = [...items]);
    	}

    	async function onLoadAtBottom() {
    		await refresh(items, viewportHeight, itemHeight);
    		if (initialized && !preItemsExisted) dispatch("initialize");
    		$$invalidate(18, preItems = [...items]);
    	}

    	async function onRemove() {
    		const beforeScrollTop = viewport.scrollTop;
    		await refresh(items, viewportHeight, itemHeight);
    		$$invalidate(3, viewport.scrollTop = beforeScrollTop, viewport);
    		$$invalidate(18, preItems = [...items]);
    	}

    	// use when direction = 'top'
    	function calculateScrollTop(rows, viewport, heightMap, diff, loaderHeight, slotItemMarginTop) {
    		const previousTopDom = rows[diff]
    		? rows[diff].firstChild
    		: rows[diff - 1] ? rows[diff - 1].firstChild : undefined; // after second time
    		// first time

    		if ((!previousTopDom || maxItemCountPerLoad === 0) && preItemsExisted) {
    			console.warn(`[Virtual Infinite List]
  The number of items exceeds 'maxItemCountPerLoad',
  so the offset after loaded may be significantly shift.`);
    		}

    		const viewportTop = viewport.getBoundingClientRect().top;
    		const topFromTop = viewportTop + loaderHeight + slotItemMarginTop;

    		const scrollTop = previousTopDom
    		? previousTopDom.getBoundingClientRect().top - topFromTop
    		: heightMap.slice(0, diff).reduce((pre, curr) => pre + curr) - topFromTop;

    		return scrollTop;
    	}

    	async function refresh(items, viewportHeight, itemHeight) {
    		const { scrollTop } = viewport;
    		await tick(); // wait until the DOM is up to date
    		let contentHeight = top - scrollTop;
    		let i = start;

    		while (contentHeight < viewportHeight && i < items.length) {
    			let row = rows[i - start];

    			if (!row) {
    				$$invalidate(12, end = i + 1);
    				await tick(); // render the newly visible row
    				row = rows[i - start];
    			}

    			const rowHeight = heightMap[i] = itemHeight || row.offsetHeight;
    			contentHeight += rowHeight;
    			i += 1;
    		}

    		$$invalidate(12, end = i);
    		const remaining = items.length - end;
    		averageHeight = (top + contentHeight) / end;
    		$$invalidate(7, bottom = remaining * averageHeight);
    		heightMap.length = items.length;
    	}

    	async function onScroll() {
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
    				$$invalidate(11, start = i);
    				$$invalidate(6, top = y);
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

    		$$invalidate(12, end = i);
    		const remaining = items.length - end;
    		averageHeight = y / end;
    		while (i < items.length) heightMap[i++] = averageHeight;
    		$$invalidate(7, bottom = remaining * averageHeight);

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

    	// more. maybe we can just call handle_scroll again?
    	async function onResize() {
    		initialized && viewport && await refresh(items, viewportHeight, itemHeight);
    	}

    	function scrollListener() {
    		const loadRequired = loadRequiredAtTop(viewport) || loadRequiredAtBottom(viewport);
    		if (!initialized || loading || !loadRequired || items.length === 0 || preItems.length === 0) return;
    		const reachedTop = viewport.scrollTop === 0;
    		const on = reachedTop ? "top" : "bottom";
    		dispatch("infinite", { on });
    	}

    	function loadRequiredAtTop(viewport) {
    		const reachedTop = viewport.scrollTop === 0;
    		return reachedTop && direction === "top";
    	}

    	function loadRequiredAtBottom(viewport) {
    		const reachedBottom = viewport.scrollHeight - viewport.scrollTop === viewport.clientHeight;
    		return reachedBottom && direction === "bottom";
    	}

    	// trigger initial refresh
    	onMount(() => {
    		rows = contents.getElementsByTagName("virtual-infinite-list-row");
    		$$invalidate(17, mounted = true);
    		viewport.addEventListener("scroll", scrollListener, { passive: true });
    	});

    	onDestroy(() => {
    		viewport.removeEventListener("scroll", scrollListener);
    	});

    	function virtual_infinite_list_contents_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			contents = $$value;
    			$$invalidate(4, contents);
    		});
    	}

    	function virtual_infinite_list_viewport_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			viewport = $$value;
    			$$invalidate(3, viewport);
    		});
    	}

    	function virtual_infinite_list_viewport_elementresize_handler() {
    		viewportHeight = this.offsetHeight;
    		$$invalidate(5, viewportHeight);
    	}

    	$$self.$$set = $$props => {
    		if ("items" in $$props) $$invalidate(13, items = $$props.items);
    		if ("loading" in $$props) $$invalidate(0, loading = $$props.loading);
    		if ("direction" in $$props) $$invalidate(1, direction = $$props.direction);
    		if ("height" in $$props) $$invalidate(2, height = $$props.height);
    		if ("itemHeight" in $$props) $$invalidate(14, itemHeight = $$props.itemHeight);
    		if ("maxItemCountPerLoad" in $$props) $$invalidate(15, maxItemCountPerLoad = $$props.maxItemCountPerLoad);
    		if ("start" in $$props) $$invalidate(11, start = $$props.start);
    		if ("end" in $$props) $$invalidate(12, end = $$props.end);
    		if ("$$scope" in $$props) $$invalidate(22, $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*initialized, loading*/ 524289) {
    			$$invalidate(19, initialized = initialized || !loading);
    		}

    		if ($$self.$$.dirty[0] & /*mounted, items*/ 139264) {
    			if (mounted && items && items.length === 0) {
    				$$invalidate(19, initialized = false);
    				preItemsExisted = false;
    				$$invalidate(18, preItems = []);
    				$$invalidate(6, top = 0);
    				$$invalidate(7, bottom = 0);
    				$$invalidate(11, start = 0);
    				$$invalidate(12, end = 0);
    				firstItemTopOnLoading = 0;
    				firstItemTopOnLoaded = 0;
    				slotItemMarginTop = undefined;
    			}
    		}

    		if ($$self.$$.dirty[0] & /*mounted, items, preItems*/ 401408) {
    			$$invalidate(20, newItemsLoaded = mounted && items && items.length > 0 && items.length - preItems.length > 0);
    		}

    		if ($$self.$$.dirty[0] & /*mounted, preItems*/ 393216) {
    			preItemsExisted = mounted && preItems.length > 0;
    		}

    		if ($$self.$$.dirty[0] & /*items, preItems*/ 270336) {
    			if (items.length - preItems.length < 0) {
    				$$invalidate(6, top = 0);
    				$$invalidate(7, bottom = 0);
    				$$invalidate(11, start = 0);
    				$$invalidate(12, end = 0);
    			}
    		}

    		if ($$self.$$.dirty[0] & /*initialized, items, start, end, maxItemCountPerLoad*/ 571392) {
    			$$invalidate(8, visible = initialized
    			? items.slice(start, end + maxItemCountPerLoad).map((data, i) => ({ index: i + start, data }))
    			: []);
    		}

    		if ($$self.$$.dirty[0] & /*newItemsLoaded, initialized, viewport*/ 1572872) {
    			if (newItemsLoaded && initialized) {
    				loadRequiredAtTop(viewport)
    				? onLoadAtTop()
    				: onLoadAtBottom();
    			}
    		}

    		if ($$self.$$.dirty[0] & /*mounted, items, preItems*/ 401408) {
    			$$invalidate(21, itemsRemoved = mounted && items && items.length > 0 && items.length - preItems.length < 0);
    		}

    		if ($$self.$$.dirty[0] & /*itemsRemoved*/ 2097152) {
    			if (itemsRemoved) onRemove();
    		}
    	};

    	return [
    		loading,
    		direction,
    		height,
    		viewport,
    		contents,
    		viewportHeight,
    		top,
    		bottom,
    		visible,
    		onScroll,
    		onResize,
    		start,
    		end,
    		items,
    		itemHeight,
    		maxItemCountPerLoad,
    		scrollTo,
    		mounted,
    		preItems,
    		initialized,
    		newItemsLoaded,
    		itemsRemoved,
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
    		if (!document.getElementById("svelte-1kggtm4-style")) add_css();

    		init(
    			this,
    			options,
    			instance,
    			create_fragment,
    			safe_not_equal,
    			{
    				items: 13,
    				loading: 0,
    				direction: 1,
    				height: 2,
    				itemHeight: 14,
    				maxItemCountPerLoad: 15,
    				scrollTo: 16,
    				start: 11,
    				end: 12
    			},
    			[-1, -1]
    		);
    	}

    	get scrollTo() {
    		return this.$$.ctx[16];
    	}
    }

    return VirtualInfiniteList;

})));
