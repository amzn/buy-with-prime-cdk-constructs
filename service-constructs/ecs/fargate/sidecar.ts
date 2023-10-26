export interface SidecarProps {
    /**
     * The minimum number of CPU units to reserve for the container.
     *
     * @default - No minimum CPU units reserved.
     */
    readonly cpu?: number;

    /**
     * The amount (in MiB) of memory to present to the container.
     * If your container attempts to exceed the allocated memory, the container
     * is terminated.
     *
     * @default - No memory limit.
     */
    readonly memoryLimitMiB?: number;

    /**
     * The soft limit (in MiB) of memory to reserve for the container.
     *
     * When system memory is under heavy contention, Docker attempts to keep the
     * container memory to this soft limit. However, your container can consume more
     * memory when it needs to, up to either the hard limit specified with the memory
     * parameter (if applicable), or all of the available memory on the container
     * instance, whichever comes first.
     *
     * @default - No memory reserved.
     */
    readonly memoryReservationMiB?: number;
}