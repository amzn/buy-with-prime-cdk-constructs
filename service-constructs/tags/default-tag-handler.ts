import { Construct } from 'constructs';
import { Tags } from 'aws-cdk-lib';
import { LIB_VERSION } from '../version';

const DefaultTags = { CDKConstructs: LIB_VERSION };

/**
 * The DefaultTagHandler utility allows default tags to be attached to Constructs.
 */
export class DefaultTagHandler {
    /**
     * Applies a default tag for version of the construct repo used
     * @param construct
     */
    static applyTags(construct: Construct): void {
        for (const [key, value] of Object.entries(DefaultTags)) {
            Tags.of(construct).add(key, value);
        }
    }
}