(function () {
    delete Function.prototype.__nonaProxyCreateInternal;
    delete Function.prototype.__nonaProxyRevokeInternal;
    delete Function.prototype.__nonaProxyPreventInternal;
    delete Function.prototype.__nonaProxySetPrototypeInternal;
    delete Function.prototype.__nonaReflectGetInternal;
    delete Function.prototype.__nonaReflectSetInternal;
    delete Function.prototype.__nonaReflectDefineInternal;
    delete Function.prototype.__nonaReflectOwnKeysInternal;
    delete Function.prototype.__nonaMarkNativeInternal;
    delete Function.prototype.__nonaMarkPromiseInternal;
    delete Function.prototype.__nonaPromiseRealmInternal;
    delete Function.prototype.__nonaRealmVmInternal;
    delete Function.prototype.__nonaSharedQueueInternal;
    delete Function.prototype.__nonaRegExpCopyInternal;
})();
