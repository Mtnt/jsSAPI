import {isFunction, isString, isEmpty, isArray, forEach, isEqual, cloneDeepWith} from 'lodash';

import {JSSAPIError} from './lib/BaseErrors';


function handleGetterError(error, def) {
    if (def === undefined) {
        throw error;
    }

    return isFunction(def) ? def() : def;
}

/**
 * Handle result of a `getItem` method and returns a received or a default value.
 *
 * @param {string[][]} keys
 * @param {Map.<string[], *>} defaultValues
 * @param {Array.<*|JSSAPIError>} resultList
 * @return {Array.<*|JSSAPIError>}
 */
function handleGetItemsResult(keys, defaultValues, resultList) {
    resultList.forEach((result, index) => {
        if (result instanceof JSSAPIError) {
        const key = keys[index];
        const def = defaultValues.get(key);

        try {
            result = handleGetterError(result, def);
        } catch (e) {
            result = e;
        }

        resultList[index] = result;
    }
});

    return resultList;
}

/**
 * Handle result of a `hasKeys` method and return a map of existence a data to an initialKey.
 *
 * @param {Array.<string|string[]>} keys
 * @param {boolean[]} resultList
 * @return {Map.<string|string[], boolean>}
 */
function handleHasKeysResult(keys, resultList) {
    const resultMap = new Map();

    resultList.forEach((keyExists, index) => {
        resultMap.set(keys[index], keyExists);
    });

    return resultMap;
}

/**
 * @abstract
 */
class Storage {
    static types = {
        SYNC: Symbol('sync'),
        ASYNC: Symbol('async'),
    };

    static keySeparator = '.';

    constructor(storage, namespace) {
        if (!isString(namespace)) {
            const message = `Not string passed into a Storage constructor: "${namespace}"`;

            throw new JSSAPIError(message);
        }

        this._storage = storage;
        this._namespace = namespace;
        this._namespaceExtenders = [];
    }

    makeShortcut(namespacePart) {
        if (!isString(namespacePart) && !isArray(namespacePart) || isEmpty(namespacePart)) {
            const message = 'Incompatible namespacePart passed into makeShortcut(): ' +
                `"${JSON.stringify(namespacePart)}"`;

            throw new JSSAPIError(message);
        }

        const shortcut = cloneDeepWith(this, (value, key) => {
            return key === '_storage' ? this._storage : undefined;
        });

        shortcut._namespaceExtenders.push(...this._getKeyParts(namespacePart));

        return shortcut;
    }

    /**
     * @param {string | string[]} key
     * @param {*} def
     */
    getItem(key, def) {
        key = this._generateKey(key);

        return this._getItem(key, def);
    }

    /**
     * @param {Array.<string|string[]|{path: string|string[], default: *}>} keys
     * @return {Array.<*|JSSAPIError>}
     */
    getItems(keys) {
        const nextKeys = [];
        const defaultValues = new Map();

        for (const keyData of keys) {
            const key = this._generateKey(keyData.path || keyData);

            nextKeys.push(key);
            defaultValues.set(key, keyData.default);
        }

        return this._getItems(nextKeys, defaultValues);
    }

    /**
     * Set `value` into storage with a `key` path
     *
     * @param {string|string[]} key
     * @param {*} value
     * @return {Promise.<void>|void}
     */
    setItem(key, value) {
        key = this._generateKey(key);

        return this._setItem(key, value);
    }

    /**
     * @param {Map.<string|string[], *>|Object.<string, *>} keyValueMap
     * @return {Promise.<void>|void}
     */
    setItems(keyValueMap) {
        const nextKVMap = new Map();

        const fillNextKVMap = (key, value) => {
            key = this._generateKey(key);

            nextKVMap.set(key, value);
        };

        if (keyValueMap instanceof Map) {
            for (let [key, value] of keyValueMap) {
                fillNextKVMap(key, value);
            }
        } else {
            forEach(keyValueMap, (value, key) => {
                fillNextKVMap(key, value);
            });
        }

        // @todo: rewrite the condition
        if (__DEV__) {
            for (const [keyToOverwrite, valueToOverwrite] of nextKVMap.entries()) {
                for (const [keyToBeOverwritten, valueToBeOverwritten] of nextKVMap.entries()) {
                    // if keys are equal and values are equal, likely it are same entries
                    if (
                        isEqual(keyToOverwrite, keyToBeOverwritten) &&
                        isEqual(valueToOverwrite, valueToBeOverwritten)
                    ) {
                        continue;
                    }

                    // check for `keyToOverwrite` can overwrite a `keyToBeOverwritten`
                    if (keyToOverwrite.length < keyToBeOverwritten.length) {
                        continue;
                    }

                    // check if `keyToBeOverwritten` is a part of or a same with `keyToOverwrite`
                    const partToCompare = keyToOverwrite.slice(0, keyToBeOverwritten.length);
                    if (!isEqual(keyToBeOverwritten, partToCompare)) {
                        continue;
                    }

                    const warnMsg = `Storage.setItems got the "${keyToOverwrite}": ` +
                        `"${valueToOverwrite}" & "${keyToBeOverwritten}": ` +
                        `"${valueToBeOverwritten}" that could potentially overwrite each" other`;
                    console.warn(warnMsg);
                }
            }
        }

        return this._setItems(nextKVMap);
    }

    /**
     * Find out a storage has a data with a `key` path
     *
     * @param {string|string[]} key
     * @return {Promise.<boolean>|boolean}
     */
    hasKey(key) {
        key = this._generateKey(key);

        return this._hasKey(key);
    }

    /**
     * @param {Array.<string|string[]>} keys
     * @return {Promise.<Map.<string|string[], boolean>>|Map.<string|string[], boolean>}
     */
    hasKeys(keys) {
        return this._hasKeys(keys);
    }

    /**
     * Remove a data from a storage by `key` path if it exists there.
     *
     * @param {string|string[]} key
     * @return {Promise.<void>|void}
     */
    removeItem(key) {
        key = this._generateKey(key);

        return this._removeItem(key);
    }

    /**
     * @param {Array.<string|string[]>} keys
     * @return {Promise.<void>|void}
     */
    removeItems(keys) {
        keys = keys.map(key => this._generateKey(key));

        return this._removeItems(keys);
    }

    /**
     * Clear all data in a storage under a `this._namespace`
     *
     * @return {Promise.<void>|void}
     */
    clear() {
        return this._clear();
    }

    /**
     * @return {boolean}
     */
    isSync() {
        return this._type === Storage.types.SYNC;
    }

    /**
     * @return {boolean}
     */
    isAsync() {
        return this._type === Storage.types.ASYNC;
    }

    _getKeyParts(key) {
        return Array.isArray(key) ? key : key.split(Storage.keySeparator);
    }

    /**
     * Generate a key parts array. A first element is always a namespace.
     *
     * @param {string | string[]} key
     * @return {string[]}
     *
     * @protected
     */
    _generateKey(key) {
        const keyParts = this._getKeyParts(key);

        return [this._namespace, ...this._namespaceExtenders, ...keyParts];
    }

    /**
     * @param {string[]} key
     * @param {*} value
     * @return {Promise.<void>|void}
     *
     * @private
     */
    _setItem(key, value) {
        return this._storage.setItem(key, value);
    }

    /**
     * @param {Map.<string[], *>} keyValueMap
     * @return {Promise.<void>|void}
     *
     * @private
     */
    _setItems(keyValueMap) {
        return this._storage.setItems(keyValueMap);
    }

    /**
     * @param {string[]} key
     * @return {Promise.<boolean>|boolean}
     *
     * @private
     */
    _hasKey(key) {
        return this._storage.hasKey(key);
    }

    /**
     * @param {string[]} key
     * @return {Promise.<void>|void}
     *
     * @private
     */
    _removeItem(key) {
        return this._storage.removeItem(key);
    }

    /**
     * @param {string[][]} keys
     * @return {Promise.<void>|void}
     *
     * @private
     */
    _removeItems(keys) {
        return this._storage.removeItems(keys);
    }

    /**
     * @return {Promise.<void>|void}
     *
     * @private
     */
    _clear() {
        return this._storage.removeItem([this._namespace]);
    }
}

export class SyncStorage extends Storage {
    _type = Storage.types.SYNC;

    /**
     * @param {string[]} key
     * @param {*} def - default value or a method to get it
     * @throws {JSSAPIError}
     * @return {*}
     *
     * @private
     */
    _getItem(key, def) {
        try {
            return this._storage.getItem(key);
        } catch (e) {
            return handleGetterError(e, def);
        }
    }

    /**
     * @param {string[][]} keys
     * @param {Map.<string[], *>} defaultValues
     * @return {Array.<*|JSSAPIError>}
     *
     * @private
     */
    _getItems(keys, defaultValues) {
        const resultList = this._storage.getItems(keys);

        return handleGetItemsResult(keys, defaultValues, resultList);
    }

    /**
     * @param {Array.<string|string[]>} keys
     * @return {Map.<string|string[], boolean>}
     *
     * @private
     */
    _hasKeys(keys) {
        const formattedKeys = keys.map(key => this._generateKey(key));

        const resultList = this._storage.hasKeys(formattedKeys);

        return handleHasKeysResult(keys, resultList);
    }
}

export class AsyncStorage extends Storage {
    _type = Storage.types.ASYNC;

    /**
     * @param {string[]} key
     * @param {*} def - default value or a method to get a defoult value
     * @return {Promise.<*, JSSAPIError>}
     *
     * @private
     */
    _getItem(key, def) {
        return this._storage.getItem(key)
            .catch(e => handleGetterError(e, def));
    }

    /**
     * @param {string[][]} keys
     * @param {Map.<string[][], *>} defaultValues
     * @return {Promise.<Array.<*|JSSAPIError>>}
     *
     * @private
     */
    _getItems(keys, defaultValues) {
        return this._storage.getItems(keys)
            .then(resultList => handleGetItemsResult(keys, defaultValues, resultList));
    }

    /**
     * @param {Array.<string|string[]>} keys
     * @return {Promise.<Map.<string|string[], boolean>>}
     *
     * @private
     */
    _hasKeys(keys) {
        const formattedKeys = keys.map(key => this._generateKey(key));

        return this._storage.hasKeys(formattedKeys)
            .then(resultList => handleHasKeysResult(keys, resultList));
    }
}

