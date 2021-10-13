import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { Collection } from '../../collections/config/types';
import { APIError } from '../../errors';
import getCookieExpiration from '../../utilities/getCookieExpiration';
import { UserDocument } from '../types';
import { fieldIsNamed } from '../../fields/config/types';

export type Result = {
  token: string
  user: UserDocument
}

export type Arguments = {
  data: {
    token: string
    password: string
  }
  collection: Collection
  res?: Response
}

async function resetPassword(args: Arguments): Promise<Result> {
  const { config, secret } = this;

  if (!Object.prototype.hasOwnProperty.call(args.data, 'token')
    || !Object.prototype.hasOwnProperty.call(args.data, 'password')) {
    throw new APIError('Missing required data.');
  }

  const {
    collection: {
      Model,
      config: collectionConfig,
    },
    data,
  } = args;

  const user = await Model.findOne({
    resetPasswordToken: data.token,
    resetPasswordExpiration: { $gt: Date.now() },
  }) as UserDocument;

  if (!user) throw new APIError('Token is either invalid or has expired.');

  await user.setPassword(data.password);

  user.resetPasswordExpiration = Date.now();

  await user.save();

  await user.authenticate(data.password);

  const fieldsToSign = collectionConfig.fields.reduce((signedFields, field) => {
    if (field.saveToJWT && fieldIsNamed(field)) {
      return {
        ...signedFields,
        [field.name]: user[field.name],
      };
    }
    return signedFields;
  }, {
    email: user.email,
    id: user.id,
    collection: collectionConfig.slug,
  });

  const token = jwt.sign(
    fieldsToSign,
    secret,
    {
      expiresIn: collectionConfig.auth.tokenExpiration,
    },
  );

  if (args.res) {
    const cookieOptions = {
      path: '/',
      httpOnly: true,
      expires: getCookieExpiration(collectionConfig.auth.tokenExpiration),
      secure: collectionConfig.auth.cookies.secure,
      sameSite: collectionConfig.auth.cookies.sameSite,
      domain: undefined,
    };


    if (collectionConfig.auth.cookies.domain) cookieOptions.domain = collectionConfig.auth.cookies.domain;

    args.res.cookie(`${config.cookiePrefix}-token`, token, cookieOptions);
  }

  const fullUser = await this.findByID({ collection: collectionConfig.slug, id: user.id });
  return { token, user: fullUser };
}

export default resetPassword;
