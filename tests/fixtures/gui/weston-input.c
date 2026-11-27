/* Test-only Weston 13 module, never linked into or installed with Nona.
 * The private display accepts compositor-seat input and a live output scale
 * change over a mode-0600 Unix datagram socket in its private runtime directory.
 * Uses the same libweston input entry points as the Weston test backend.
 */
#define _GNU_SOURCE
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>
#include <libweston/libweston.h>
#include <libweston/desktop.h>

/* Exported by libweston-13; declarations live in upstream backend.h and
 * libweston-internal.h rather than the installed public development headers.
 * This module is deliberately pinned to Weston 13, not a production API. */
void weston_seat_init(struct weston_seat *, struct weston_compositor *, const char *);
void weston_seat_release(struct weston_seat *);
int weston_seat_init_pointer(struct weston_seat *);
int weston_seat_init_keyboard(struct weston_seat *, struct xkb_keymap *);
void notify_motion_absolute(struct weston_seat *, const struct timespec *, struct weston_coord_global);
void notify_pointer_frame(struct weston_seat *);
void notify_button(struct weston_seat *, const struct timespec *, int32_t, enum wl_pointer_button_state);
void notify_key(struct weston_seat *, const struct timespec *, uint32_t,
                enum wl_keyboard_key_state, enum weston_key_state_update);

struct driver {
    struct weston_compositor *compositor;
    struct weston_seat seat;
    struct wl_listener destroy, capture;
    struct wl_event_source *source;
    int fd;
    char path[108];
};

static struct weston_view *main_view(struct driver *d) {
    struct weston_view *v;
    wl_list_for_each(v, &d->compositor->view_list, link) {
        if (!weston_view_is_mapped(v) || !weston_surface_is_desktop_surface(v->surface)) continue;
        const char *title = weston_desktop_surface_get_title(weston_surface_get_desktop_surface(v->surface));
        if (title && strcmp(title, "Nona desktop acceptance") == 0) return v;
    }
    return NULL;
}

static int command(int fd, uint32_t mask, void *data) {
    (void)mask;
    struct driver *d = data;
    struct sockaddr_un peer;
    socklen_t length = sizeof(peer);
    char line[256], reply[128] = "ok";
    ssize_t n = recvfrom(fd, line, sizeof(line)-1, 0, (struct sockaddr *)&peer, &length);
    if (n <= 0) return 0;
    line[n] = 0;
    struct timespec now;
    weston_compositor_get_time(&now);
    unsigned code, state;
    double x, y;
    struct weston_view *v = main_view(d);
    if (strcmp(line, "ping") == 0) {
        snprintf(reply, sizeof(reply), "ok weston-13 native seat");
    } else if (sscanf(line, "key %u %u", &code, &state) == 2 && code < 768 && state < 2) {
        notify_key(&d->seat, &now, code, state, STATE_UPDATE_AUTOMATIC);
    } else if (sscanf(line, "button %u %u", &code, &state) == 2 && code == 272 && state < 2) {
        notify_button(&d->seat, &now, code, state);
        notify_pointer_frame(&d->seat);
    } else if (sscanf(line, "move %lf %lf", &x, &y) == 2 && v) {
        struct weston_geometry g = weston_desktop_surface_get_geometry(weston_surface_get_desktop_surface(v->surface));
        struct weston_coord_surface local = weston_coord_surface(x + g.x, y + g.y, v->surface);
        notify_motion_absolute(&d->seat, &now, weston_coord_surface_to_global(v, local));
        notify_pointer_frame(&d->seat);
    } else if (strcmp(line, "focus") == 0 && v) {
        weston_view_activate_input(v, &d->seat, WESTON_ACTIVATE_FLAG_CONFIGURE);
    } else if (strcmp(line, "close") == 0 && v) {
        weston_desktop_surface_close(weston_surface_get_desktop_surface(v->surface));
    } else if (sscanf(line, "scale %u", &code) == 1 && (code == 1 || code == 2)) {
        struct weston_output *o;
        wl_list_for_each(o, &d->compositor->output_list, link) weston_output_set_scale(o, code);
        /* The logical output shrinks at scale 2. Keep the SAME view/surface
         * within it so later physical input still reaches the application. */
        if (v) {
            struct weston_coord_global origin = { .c = weston_coord(32, 32) };
            weston_view_set_position(v, origin);
            weston_view_update_transform(v);
            weston_view_schedule_repaint(v);
        }
    } else {
        snprintf(reply, sizeof(reply), "error invalid command or unmapped main surface");
    }
    fprintf(stderr, "nona-input: %s -> %s\n", line, reply);
    sendto(fd, reply, strlen(reply), 0, (struct sockaddr *)&peer, length);
    return 0;
}

static void capture(struct wl_listener *listener, struct weston_output_capture_attempt *attempt) {
    (void)listener;
    /* Only the disposable, isolated CI compositor loads this module. */
    attempt->authorized = true;
}
static void destroy(struct wl_listener *listener, void *data) {
    (void)data;
    struct driver *d = wl_container_of(listener, d, destroy);
    wl_list_remove(&d->destroy.link);
    wl_list_remove(&d->capture.link);
    wl_event_source_remove(d->source);
    close(d->fd); unlink(d->path);
    weston_seat_release(&d->seat);
    free(d);
}

WL_EXPORT int wet_module_init(struct weston_compositor *compositor, int *argc, char *argv[]) {
    (void)argc; (void)argv;
    int major, minor, micro;
    weston_version(&major, &minor, &micro);
    if (major != 13) return -1;
    const char *path = getenv("NONA_WESTON_INPUT");
    if (!path || strlen(path) >= sizeof(((struct driver *)0)->path)) return -1;
    struct driver *d = calloc(1, sizeof(*d));
    if (!d) return -1;
    d->compositor = compositor;
    strcpy(d->path, path);
    d->fd = socket(AF_UNIX, SOCK_DGRAM | SOCK_NONBLOCK | SOCK_CLOEXEC, 0);
    struct sockaddr_un address = { .sun_family = AF_UNIX };
    strcpy(address.sun_path, path);
    if (d->fd < 0 || bind(d->fd, (struct sockaddr *)&address, sizeof(address)) < 0) {
        if (d->fd >= 0) close(d->fd);
        free(d); return -1;
    }
    if (chmod(path, 0600) < 0) { close(d->fd); unlink(path); free(d); return -1; }
    weston_seat_init(&d->seat, compositor, "nona-native-input");
    if (weston_seat_init_pointer(&d->seat) < 0 || weston_seat_init_keyboard(&d->seat, NULL) < 0) {
        weston_seat_release(&d->seat); close(d->fd); unlink(path); free(d); return -1;
    }
    d->source = wl_event_loop_add_fd(wl_display_get_event_loop(compositor->wl_display),
                                    d->fd, WL_EVENT_READABLE, command, d);
    if (!d->source) {
        weston_seat_release(&d->seat); close(d->fd); unlink(path); free(d); return -1;
    }
    d->destroy.notify = destroy;
    wl_signal_add(&compositor->destroy_signal, &d->destroy);
    weston_compositor_add_screenshot_authority(compositor, &d->capture, capture);
    return 0;
}
