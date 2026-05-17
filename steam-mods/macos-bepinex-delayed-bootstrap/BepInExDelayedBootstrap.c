#define _DARWIN_C_SOURCE
#include <dlfcn.h>
#include <pthread.h>
#include <stdio.h>
#include <unistd.h>

static void *bootstrap_thread(void *unused) {
    (void)unused;

    sleep(1);

    void *doorstop = dlopen("libdoorstop.dylib", RTLD_NOW | RTLD_NOLOAD);
    if (!doorstop) {
        doorstop = dlopen("libdoorstop.dylib", RTLD_NOW);
    }

    fprintf(stderr, "[BepInExDelayedBootstrap] doorstop=%p\n", doorstop);
    if (!doorstop) {
        fprintf(stderr, "[BepInExDelayedBootstrap] dlerror=%s\n", dlerror());
        fflush(stderr);
        return NULL;
    }

    void (*bootstrap)(void) =
        (void (*)(void))dlsym(doorstop, "il2cpp_doorstop_bootstrap");
    fprintf(stderr, "[BepInExDelayedBootstrap] bootstrap=%p\n", bootstrap);
    fflush(stderr);

    if (bootstrap) {
        bootstrap();
        fprintf(stderr, "[BepInExDelayedBootstrap] bootstrap returned\n");
        fflush(stderr);
    } else {
        fprintf(stderr, "[BepInExDelayedBootstrap] dlsym error=%s\n", dlerror());
        fflush(stderr);
    }

    return NULL;
}

__attribute__((constructor)) static void ctor(void) {
    pthread_t thread;
    int rc = pthread_create(&thread, NULL, bootstrap_thread, NULL);
    if (rc == 0) {
        pthread_detach(thread);
    }
    fprintf(stderr, "[BepInExDelayedBootstrap] loaded rc=%d\n", rc);
    fflush(stderr);
}
